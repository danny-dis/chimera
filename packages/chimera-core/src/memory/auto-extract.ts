import { z } from 'zod';
import { sideQuery } from '../side-query.js';
import type { LongTermMemory } from './long-term-memory.js';
import type { MemoryItem } from './types.js';

export const ExtractionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  model: z.string().optional(),
  minImportance: z.number().min(0).max(1).default(0.3),
  maxTokens: z.number().positive().default(512),
  timeoutMs: z.number().positive().default(15_000),
  // Write gate: novelty detection threshold (cosine similarity)
  // If an incoming fact is above this threshold to an existing memory, it's considered duplicate
  noveltyThreshold: z.number().min(0).max(1).default(0.85),
  // Enable write gate (novelty check before writing)
  enableWriteGate: z.boolean().default(true),
});
export type ExtractionConfig = z.infer<typeof ExtractionConfigSchema>;

const ExtractedFactSchema = z.object({
  facts: z.array(
    z.object({
      content: z.string().min(1),
      type: z.enum(['user', 'feedback', 'project', 'reference']),
      importance: z.number().min(0).max(1),
      tags: z.array(z.string()),
    }),
  ),
});
export type ExtractedFacts = z.infer<typeof ExtractedFactSchema>;

function buildExtractionPrompt(messages: string): string {
  return [
    'Extract durable facts from this conversation turn. Classify each as:',
    '- user: user preferences, habits, or personal context',
    '- feedback: explicit praise, criticism, or correction about the agent or its output',
    '- project: project structure, conventions, naming patterns, or technical decisions',
    '- reference: external resources, documentation links, or tool commands mentioned',
    '',
    'Only extract facts that would be useful in FUTURE sessions. Skip ephemeral details.',
    'Return importance 0-1 (0.9+ for strong preferences, 0.5 for typical facts, 0.3 for weak signals).',
    '',
    '<conversation>',
    messages,
    '</conversation>',
  ].join('\n');
}

/**
 * Cosine similarity between two embedding vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Turn-level extraction of durable facts from conversation messages.
 * Uses sideQuery (cheap LLM) to classify and score facts, then writes
 * qualifying facts to LongTermMemory.
 * 
 * Write gate: before writing, checks novelty against existing memories.
 * If a similar fact already exists (above noveltyThreshold), skips the write.
 */
export class AutoExtractService {
  private memory: LongTermMemory;
  private config: ExtractionConfig;

  constructor(memory: LongTermMemory, config?: Partial<ExtractionConfig>) {
    this.memory = memory;
    this.config = ExtractionConfigSchema.parse(config ?? {});
  }

  /**
   * Extract facts from messages starting at `cursor`.
   * Returns the new cursor position (index of next unprocessed message).
   */
  async extract(input: {
    messages: Array<{ role: string; content: string }>;
    sessionId: string;
    cursor: number;
  }): Promise<number> {
    if (!this.config.enabled || input.cursor >= input.messages.length) {
      return input.cursor;
    }

    const newMessages = input.messages.slice(input.cursor);
    if (newMessages.length === 0) return input.cursor;

    const formatted = newMessages
      .map((m) => `[${m.role}]: ${m.content.slice(0, 2000)}`)
      .join('\n');

    const result = await sideQuery<ExtractedFacts>({
      prompt: buildExtractionPrompt(formatted),
      schema: ExtractedFactSchema,
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      timeoutMs: this.config.timeoutMs,
    });

    if (!result.ok) return input.messages.length;

    for (const fact of result.data.facts) {
      if (fact.importance < this.config.minImportance) continue;

      // Write gate: novelty detection
      if (this.config.enableWriteGate) {
        const isNovel = await this.isNovel(fact.content);
        if (!isNovel) continue; // Skip duplicate/redundant facts
      }

      await this.memory.write({
        content: fact.content,
        topic: fact.type,
        importance: fact.importance,
        source: 'agent',
        sessionId: input.sessionId,
        tags: fact.tags ?? [],
      });
    }

    return input.messages.length;
  }

  /**
   * Check if a fact is novel (not already in memory).
   * Returns true if no existing memory is above the novelty threshold.
   */
  private async isNovel(content: string): Promise<boolean> {
    const provider = this.memory.getEmbeddingProvider();
    if (!provider) return true; // Can't check, assume novel

    const embedding = await provider.embed(content);
    const existing = this.memory.getAll();

    for (const item of existing) {
      const sim = cosineSimilarity(embedding, item.embedding);
      if (sim >= this.config.noveltyThreshold) {
        return false; // Too similar to existing memory
      }
    }
    return true;
  }
}
