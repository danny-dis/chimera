import { z } from 'zod';
import type { LongTermMemory } from './long-term-memory.js';
export declare const ExtractionConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    model: z.ZodOptional<z.ZodString>;
    minImportance: z.ZodDefault<z.ZodNumber>;
    maxTokens: z.ZodDefault<z.ZodNumber>;
    timeoutMs: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    model?: string;
    maxTokens?: number;
    enabled?: boolean;
    minImportance?: number;
    timeoutMs?: number;
}, {
    model?: string;
    maxTokens?: number;
    enabled?: boolean;
    minImportance?: number;
    timeoutMs?: number;
}>;
export type ExtractionConfig = z.infer<typeof ExtractionConfigSchema>;
declare const ExtractedFactSchema: z.ZodObject<{
    facts: z.ZodArray<z.ZodObject<{
        content: z.ZodString;
        type: z.ZodEnum<["user", "feedback", "project", "reference"]>;
        importance: z.ZodNumber;
        tags: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        type?: "user" | "feedback" | "project" | "reference";
        tags?: string[];
        content?: string;
        importance?: number;
    }, {
        type?: "user" | "feedback" | "project" | "reference";
        tags?: string[];
        content?: string;
        importance?: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    facts?: {
        type?: "user" | "feedback" | "project" | "reference";
        tags?: string[];
        content?: string;
        importance?: number;
    }[];
}, {
    facts?: {
        type?: "user" | "feedback" | "project" | "reference";
        tags?: string[];
        content?: string;
        importance?: number;
    }[];
}>;
export type ExtractedFacts = z.infer<typeof ExtractedFactSchema>;
/**
 * Turn-level extraction of durable facts from conversation messages.
 * Uses sideQuery (cheap LLM) to classify and score facts, then writes
 * qualifying facts to LongTermMemory.
 */
export declare class AutoExtractService {
    private memory;
    private config;
    constructor(memory: LongTermMemory, config?: Partial<ExtractionConfig>);
    /**
     * Extract facts from messages starting at `cursor`.
     * Returns the new cursor position (index of next unprocessed message).
     */
    extract(input: {
        messages: Array<{
            role: string;
            content: string;
        }>;
        sessionId: string;
        cursor: number;
    }): Promise<number>;
}
export {};
//# sourceMappingURL=auto-extract.d.ts.map