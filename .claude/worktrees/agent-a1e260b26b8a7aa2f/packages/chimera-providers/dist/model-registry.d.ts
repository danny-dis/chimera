import { z } from 'zod';
export declare const ModelEntrySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    provider: z.ZodString;
    contextWindow: z.ZodNumber;
    maxOutputTokens: z.ZodNumber;
    pricing: z.ZodObject<{
        inputPerMillion: z.ZodNumber;
        outputPerMillion: z.ZodNumber;
        cacheReadPerMillion: z.ZodOptional<z.ZodNumber>;
        cacheWritePerMillion: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        inputPerMillion: number;
        outputPerMillion: number;
        cacheReadPerMillion?: number | undefined;
        cacheWritePerMillion?: number | undefined;
    }, {
        inputPerMillion: number;
        outputPerMillion: number;
        cacheReadPerMillion?: number | undefined;
        cacheWritePerMillion?: number | undefined;
    }>;
    capabilities: z.ZodObject<{
        toolCalling: z.ZodBoolean;
        structuredOutput: z.ZodBoolean;
        vision: z.ZodBoolean;
        reasoning: z.ZodBoolean;
        parallelToolCalls: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        toolCalling: boolean;
        structuredOutput: boolean;
        vision: boolean;
        reasoning: boolean;
        parallelToolCalls: boolean;
    }, {
        toolCalling: boolean;
        structuredOutput: boolean;
        vision: boolean;
        reasoning: boolean;
        parallelToolCalls: boolean;
    }>;
    degradationThreshold: z.ZodNumber;
    tier: z.ZodEnum<["cheap", "mid", "frontier", "reasoning"]>;
    releaseDate: z.ZodOptional<z.ZodString>;
    deprecated: z.ZodOptional<z.ZodBoolean>;
    replacement: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    provider: string;
    contextWindow: number;
    maxOutputTokens: number;
    pricing: {
        inputPerMillion: number;
        outputPerMillion: number;
        cacheReadPerMillion?: number | undefined;
        cacheWritePerMillion?: number | undefined;
    };
    capabilities: {
        toolCalling: boolean;
        structuredOutput: boolean;
        vision: boolean;
        reasoning: boolean;
        parallelToolCalls: boolean;
    };
    degradationThreshold: number;
    tier: "reasoning" | "cheap" | "mid" | "frontier";
    releaseDate?: string | undefined;
    deprecated?: boolean | undefined;
    replacement?: string | undefined;
}, {
    id: string;
    name: string;
    provider: string;
    contextWindow: number;
    maxOutputTokens: number;
    pricing: {
        inputPerMillion: number;
        outputPerMillion: number;
        cacheReadPerMillion?: number | undefined;
        cacheWritePerMillion?: number | undefined;
    };
    capabilities: {
        toolCalling: boolean;
        structuredOutput: boolean;
        vision: boolean;
        reasoning: boolean;
        parallelToolCalls: boolean;
    };
    degradationThreshold: number;
    tier: "reasoning" | "cheap" | "mid" | "frontier";
    releaseDate?: string | undefined;
    deprecated?: boolean | undefined;
    replacement?: string | undefined;
}>;
export type ModelEntry = z.infer<typeof ModelEntrySchema>;
export declare class ModelRegistry {
    private models;
    constructor(initialModels?: ModelEntry[]);
    get(id: string): ModelEntry | undefined;
    getByProvider(provider: string): ModelEntry[];
    getByTier(tier: string): ModelEntry[];
    search(query: string): ModelEntry[];
    getAll(): ModelEntry[];
    register(entry: ModelEntry): void;
    isRegistered(id: string): boolean;
}
//# sourceMappingURL=model-registry.d.ts.map