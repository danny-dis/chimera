import { z } from 'zod';
import type { LongTermMemory } from './long-term-memory.js';
import type { MemoryResult } from './types.js';

export const RecallConfigSchema = z.object({
  maxMemories: z.number().positive().default(5),
  maxTokens: z.number().positive().default(2000),
  minScore: z.number().min(0).max(1).default(0.15),
  boostAccessedRecently: z.number().min(0).max(2).default(1.2),
  boostHighImportance: z.number().min(0).max(2).default(1.3),
});
export type RecallConfig = z.infer<typeof RecallConfigSchema>;

const RECENT_THRESHOLD_MS = 60 * 60 * 1000;
const CHARS_PER_TOKEN = 4;

/**
 * Token-budget-aware memory retrieval with recency and importance boosting.
 * Over-fetches from LongTermMemory, re-scores with boost factors, and
 * truncates output to fit within a token budget.
 */
export class RecallService {
  private memory: LongTermMemory;
  private config: RecallConfig;

  constructor(memory: LongTermMemory, config?: Partial<RecallConfig>) {
    this.memory = memory;
    this.config = RecallConfigSchema.parse(config ?? {});
  }

  /**
   * Retrieve and rank memories for a given query.
   * Returns a formatted string suitable for system prompt injection.
   */
  async recall(params: {
    query: string;
    sessionId?: string;
  }): Promise<string> {
    const overfetch = this.config.maxMemories * 3;
    const results = await this.memory.retrieve({ text: params.query, topK: overfetch });

    const now = Date.now();
    const scored = results
      .map((r) => this.boostScore(r, now))
      .filter((r) => r.score >= this.config.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxMemories);

    if (scored.length === 0) return '';

    const lines: string[] = [];
    let tokenEstimate = 0;

    for (const r of scored) {
      const line = `- [${r.item.metadata.topic}] ${r.item.content} (score: ${r.score.toFixed(2)})`;
      const lineTokens = Math.ceil(line.length / CHARS_PER_TOKEN);

      if (tokenEstimate + lineTokens > this.config.maxTokens) break;
      lines.push(line);
      tokenEstimate += lineTokens;
    }

    return lines.join('\n');
  }

  private boostScore(result: MemoryResult, now: number): MemoryResult {
    let boosted = result.score;
    const age = now - result.item.metadata.lastAccessedAt;

    if (age < RECENT_THRESHOLD_MS) {
      boosted *= this.config.boostAccessedRecently;
    }

    if (result.item.metadata.importance > 0.7) {
      boosted *= this.config.boostHighImportance;
    }

    return { ...result, score: boosted };
  }
}
