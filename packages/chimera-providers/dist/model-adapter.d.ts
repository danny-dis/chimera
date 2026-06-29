import { z } from 'zod';
export declare const ProviderConfigSchema: z.ZodObject<{
    name: z.ZodString;
    provider: z.ZodString;
    baseUrl: z.ZodOptional<z.ZodString>;
    model: z.ZodString;
    apiKey: z.ZodOptional<z.ZodString>;
    role: z.ZodEnum<["writer", "reviewer", "challenger"]>;
    /** Per-provider request timeout in milliseconds. Overrides the default (60s). */
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    constraints: z.ZodObject<{
        maxTokensPerTurn: z.ZodNumber;
        costCapPerTask: z.ZodNumber;
        costCapPerSession: z.ZodNumber;
        costCapPerDay: z.ZodNumber;
        maxParallelInstances: z.ZodNumber;
        rateLimitRpm: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        maxTokensPerTurn: number;
        costCapPerTask: number;
        costCapPerSession: number;
        costCapPerDay: number;
        maxParallelInstances: number;
        rateLimitRpm: number;
    }, {
        maxTokensPerTurn: number;
        costCapPerTask: number;
        costCapPerSession: number;
        costCapPerDay: number;
        maxParallelInstances: number;
        rateLimitRpm: number;
    }>;
    rateLimits: z.ZodOptional<z.ZodObject<{
        rpm: z.ZodOptional<z.ZodNumber>;
        tpm: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        rpm?: number | undefined;
        tpm?: number | undefined;
    }, {
        rpm?: number | undefined;
        tpm?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    provider: string;
    model: string;
    role: "writer" | "reviewer" | "challenger";
    constraints: {
        maxTokensPerTurn: number;
        costCapPerTask: number;
        costCapPerSession: number;
        costCapPerDay: number;
        maxParallelInstances: number;
        rateLimitRpm: number;
    };
    timeoutMs?: number | undefined;
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    rateLimits?: {
        rpm?: number | undefined;
        tpm?: number | undefined;
    } | undefined;
}, {
    name: string;
    provider: string;
    model: string;
    role: "writer" | "reviewer" | "challenger";
    constraints: {
        maxTokensPerTurn: number;
        costCapPerTask: number;
        costCapPerSession: number;
        costCapPerDay: number;
        maxParallelInstances: number;
        rateLimitRpm: number;
    };
    timeoutMs?: number | undefined;
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    rateLimits?: {
        rpm?: number | undefined;
        tpm?: number | undefined;
    } | undefined;
}>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export interface ModelAdapter {
    complete(prompt: string, options?: Record<string, unknown>): Promise<string>;
    stream(prompt: string, options?: Record<string, unknown>): AsyncIterable<string>;
    getCost(tokens: {
        input: number;
        output: number;
    }): number;
}
//# sourceMappingURL=model-adapter.d.ts.map