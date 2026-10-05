import { z } from 'zod';
import type { LongTermMemory } from './long-term-memory.js';
import type { MemoryResult } from './types.js';
import { cosineSimilarity } from './vector-store.js';

export const RecallConfigSchema = z.object({
  maxMemories: z.number().positive().default(5),
  maxTokens: z.number().positive().default(2000),
  minScore: z.number().min(0).max(1).default(0.15),
  boostAccessedRecently: z.number().min(0).max(2).default(1.2),
  boostHighImportance: z.number().min(0).max(2).default(1.3),
  // Hybrid retrieval weights
  vectorWeight: z.number().min(0).max(1).default(0.6),
  keywordWeight: z.number().min(0).max(1).default(0.2),
  temporalWeight: z.number().min(0).max(1).default(0.2),
  // Temporal decay: half-life in days for recency scoring
  temporalHalfLifeDays: z.number().positive().default(30),
  // Enable keyword matching (BM25-style term overlap)
  enableKeywordMatch: z.boolean().default(true),
});
export type RecallConfig = z.infer<typeof RecallConfigSchema>;

const RECENT_THRESHOLD_MS = 60 * 60 * 1000;
const CHARS_PER_TOKEN = 4;

/**
 * Compute keyword overlap score between query and memory content.
 * Uses simple Jaccard similarity on token sets.
 */
function keywordScore(query: string, content: string): number {
  const queryTokens = new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
  const contentTokens = new Set(content.toLowerCase().split(/\W+/).filter(Boolean));
  
  if (queryTokens.size === 0 || contentTokens.size === 0) return 0;
  
  let intersection = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) intersection++;
  }
  
  // Jaccard similarity
  const union = queryTokens.size + contentTokens.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Temporal decay score: newer memories score higher.
 * Uses exponential decay with configurable half-life.
 */
function temporalScore(createdAt: number, now: number, halfLifeDays: number): number {
  const ageMs = now - createdAt;
  const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
  return Math.pow(0.5, ageMs / halfLifeMs);
}

/**
 * Token-budget-aware memory retrieval with hybrid scoring.
 * Combines vector similarity, keyword overlap, and temporal decay.
 * Over-fetches from LongTermMemory, re-scores with hybrid weights, and
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
      .map((r) => this.hybridScore(r, params.query, now))
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

  /**
   * Compute hybrid score combining vector, keyword, and temporal signals.
   */
  private hybridScore(result: MemoryResult, query: string, now: number): MemoryResult {
    const vectorScore = result.score;
    
    // Keyword match score
    const kwScore = this.config.enableKeywordMatch 
      ? keywordScore(query, result.item.content) 
      : 0;
    
    // Temporal decay score
    const tempScore = temporalScore(
      result.item.metadata.createdAt, 
      now, 
      this.config.temporalHalfLifeDays
    );
    
    // Weighted combination
    const combined = 
      this.config.vectorWeight * vectorScore +
      this.config.keywordWeight * kwScore +
      this.config.temporalWeight * tempScore;
    
    // Apply boosts
    let boosted = combined;
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
