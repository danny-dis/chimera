import { z } from 'zod';
export declare const ProviderConfigSchema: z.ZodObject<{
    name: z.ZodString;
    provider: z.ZodString;
    baseUrl: z.ZodOptional<z.ZodString>;
    model: z.ZodString;
    apiKey: z.ZodOptional<z.ZodString>;
    role: z.ZodEnum<["writer", "reviewer", "challenger"]>;
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
}, "strip", z.ZodTypeAny, {
    role: "challenger" | "writer" | "reviewer";
    provider: string;
    model: string;
    name: string;
    constraints: {
        maxTokensPerTurn: number;
        costCapPerTask: number;
        costCapPerSession: number;
        costCapPerDay: number;
        maxParallelInstances: number;
        rateLimitRpm: number;
    };
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
}, {
    role: "challenger" | "writer" | "reviewer";
    provider: string;
    model: string;
    name: string;
    constraints: {
        maxTokensPerTurn: number;
        costCapPerTask: number;
        costCapPerSession: number;
        costCapPerDay: number;
        maxParallelInstances: number;
        rateLimitRpm: number;
    };
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
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