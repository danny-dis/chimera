import { z } from 'zod';
import type { LongTermMemory } from './long-term-memory.js';
export declare const RecallConfigSchema: z.ZodObject<{
    maxMemories: z.ZodDefault<z.ZodNumber>;
    maxTokens: z.ZodDefault<z.ZodNumber>;
    minScore: z.ZodDefault<z.ZodNumber>;
    boostAccessedRecently: z.ZodDefault<z.ZodNumber>;
    boostHighImportance: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    maxTokens?: number;
    maxMemories?: number;
    minScore?: number;
    boostAccessedRecently?: number;
    boostHighImportance?: number;
}, {
    maxTokens?: number;
    maxMemories?: number;
    minScore?: number;
    boostAccessedRecently?: number;
    boostHighImportance?: number;
}>;
export type RecallConfig = z.infer<typeof RecallConfigSchema>;
/**
 * Token-budget-aware memory retrieval with recency and importance boosting.
 * Over-fetches from LongTermMemory, re-scores with boost factors, and
 * truncates output to fit within a token budget.
 */
export declare class RecallService {
    private memory;
    private config;
    constructor(memory: LongTermMemory, config?: Partial<RecallConfig>);
    /**
     * Retrieve and rank memories for a given query.
     * Returns a formatted string suitable for system prompt injection.
     */
    recall(params: {
        query: string;
        sessionId?: string;
    }): Promise<string>;
    private boostScore;
}
//# sourceMappingURL=recall-service.d.ts.map