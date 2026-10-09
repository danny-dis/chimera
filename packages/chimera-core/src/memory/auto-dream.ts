import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, statSync } from 'fs';
import path from 'path';
import { z } from 'zod';
import { sideQuery } from '../side-query.js';
import type { LongTermMemory } from './long-term-memory.js';
import type { MemoryItem } from './types.js';
import { cosineSimilarity } from './vector-store.js';

export const DreamConfigSchema = z.object({
  enabled: z.boolean().default(true),
  minSessionGap: z.number().positive().default(5),
  minTimeGapMs: z.number().min(0).default(86_400_000),
  lockfileDir: z.string().optional(),
  maxMemoriesPerConsolidation: z.number().positive().default(20),
  model: z.string().optional(),
  // Recurrence-based consolidation: only consolidate when ≥ this many
  // semantically similar items exist. Reduces LLM cost by up to 87%
  // compared to eager consolidation.
  recurrenceThreshold: z.number().positive().default(5),
  // Similarity threshold for grouping items into recurrence clusters
  recurrenceSimilarity: z.number().min(0).max(1).default(0.85),
  // Enable recurrence-based trigger (falls back to session-gap if disabled)
  enableRecurrenceTrigger: z.boolean().default(true),
});
export type DreamConfig = z.infer<typeof DreamConfigSchema>;

export interface DreamState {
  lastDreamAt: number;
  sessionsSinceDream: number;
  totalDreams: number;
}

const STALE_LOCK_MS = 5 * 60 * 1000;

const ConsolidationSchema = z.object({
  summaries: z.array(
    z.object({
      topic: z.string(),
      summary: z.string().min(1),
      sourceIds: z.array(z.string()),
      importance: z.number().min(0).max(1),
    }),
  ),
});

/**
 * 4-phase periodic memory consolidation:
 *   Orient → Gather → Consolidate → Prune
 *
 * Gated by session count and time since last dream.
 * Uses PID lockfile (mtime-based stale detection) for process safety.
 */
export class AutoDreamService {
  private memory: LongTermMemory;
  private config: DreamConfig;
  private state: DreamState;
  private lockfilePath: string;
  private statePath: string;

  constructor(memory: LongTermMemory, config?: Partial<DreamConfig>) {
    this.memory = memory;
    this.config = DreamConfigSchema.parse(config ?? {});

    const lockDir = this.config.lockfileDir ?? path.join('.chimera', 'memory');
    if (!existsSync(lockDir)) mkdirSync(lockDir, { recursive: true });

    this.lockfilePath = path.join(lockDir, '.dream.lock');
    this.statePath = path.join(lockDir, '.dream-state.json');
    this.state = this.loadState();
  }

  async shouldDream(): Promise<boolean> {
    if (!this.config.enabled) return false;

    this.state.sessionsSinceDream++;
    this.saveState();

    if (this.state.sessionsSinceDream < this.config.minSessionGap) return false;
    if (Date.now() - this.state.lastDreamAt < this.config.minTimeGapMs) return false;

    // Recurrence-based trigger: only dream if there are enough similar items
    if (this.config.enableRecurrenceTrigger) {
      const hasRecurrence = await this.checkRecurrence();
      if (!hasRecurrence) return false;
    }

    return true;
  }

  /**
   * Check if there are enough semantically similar items to warrant consolidation.
   * Looks for clusters of items with similarity above the threshold.
   */
  private async checkRecurrence(): Promise<boolean> {
    const provider = this.memory.getEmbeddingProvider();
    if (!provider) return true; // Can't check, fall back to session-gap

    const items = this.memory.getAll();
    if (items.length < this.config.recurrenceThreshold) return false;

    // Check if any item has enough similar neighbors
    for (let i = 0; i < items.length; i++) {
      let similarCount = 0;
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const sim = cosineSimilarity(items[i].embedding, items[j].embedding);
        if (sim >= this.config.recurrenceSimilarity) {
          similarCount++;
        }
      }
      if (similarCount >= this.config.recurrenceThreshold) {
        return true;
      }
    }
    return false;
  }

  async dream(): Promise<{ consolidated: number; pruned: number }> {
    const locked = await this.acquirePidLock();
    if (!locked) return { consolidated: 0, pruned: 0 };

    try {
      const candidates = this.orient();
      if (candidates.length === 0) return { consolidated: 0, pruned: 0 };

      const groups = this.gather(candidates);
      const consolidated = await this.consolidate(groups);
      const pruned = this.prune();

      this.state.lastDreamAt = Date.now();
      this.state.sessionsSinceDream = 0;
      this.state.totalDreams++;
      this.saveState();

      return { consolidated, pruned };
    } finally {
      this.releasePidLock();
    }
  }

  getState(): DreamState {
    return { ...this.state };
  }

  private orient(): MemoryItem[] {
    const all = this.memory.getAll();
    const since = this.state.lastDreamAt;
    return since > 0 ? all.filter((m) => m.metadata.createdAt > since) : all;
  }

  private gather(items: MemoryItem[]): Map<string, MemoryItem[]> {
    const groups = new Map<string, MemoryItem[]>();
    for (const item of items.slice(0, this.config.maxMemoriesPerConsolidation)) {
      const topic = item.metadata.topic;
      const group = groups.get(topic) ?? [];
      group.push(item);
      groups.set(topic, group);
    }
    return groups;
  }

  private async consolidate(groups: Map<string, MemoryItem[]>): Promise<number> {
    let count = 0;

    for (const [topic, items] of groups) {
      if (items.length < 2) continue;

      const itemsText = items.map((m) => `[${m.id}] ${m.content}`).join('\n');
      const result = await sideQuery({
        prompt: `Summarize these ${items.length} related memories about "${topic}" into a single concise fact. Preserve the most important details.\n\n${itemsText}`,
        schema: ConsolidationSchema,
        model: this.config.model,
        maxTokens: 1024,
        timeoutMs: 30_000,
      });

      if (!result.ok) continue;

      for (const s of result.data.summaries) {
        await this.memory.summarize({
          topic: s.topic,
          summaryContent: s.summary,
          sourceMemoryIds: s.sourceIds,
          importance: s.importance,
        });
        count++;
      }
    }

    return count;
  }

  private prune(): number {
    this.memory.decay();
    return this.memory.prune(0.01);
  }

  private async acquirePidLock(): Promise<boolean> {
    if (existsSync(this.lockfilePath)) {
      try {
        const stat = statSync(this.lockfilePath);
        if (Date.now() - stat.mtimeMs < STALE_LOCK_MS) return false;
      } catch {
        // stat failed — treat as stale
      }
    }

    try {
      writeFileSync(this.lockfilePath, String(process.pid), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  private releasePidLock(): void {
    try {
      if (existsSync(this.lockfilePath)) unlinkSync(this.lockfilePath);
    } catch {
      // best-effort cleanup
    }
  }

  private loadState(): DreamState {
    if (existsSync(this.statePath)) {
      try {
        return JSON.parse(readFileSync(this.statePath, 'utf-8'));
      } catch {
        // corrupted — start fresh
      }
    }
    return { lastDreamAt: 0, sessionsSinceDream: 0, totalDreams: 0 };
  }

  private saveState(): void {
    const dir = path.dirname(this.statePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(this.state), 'utf-8');
  }
}
