import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  name: z.string(),
  provider: z.string(),
  baseUrl: z.string().optional(),
  model: z.string(),
  apiKey: z.string(),
  role: z.enum(['writer', 'reviewer', 'challenger']),
  constraints: z.object({
    maxTokensPerTurn: z.number(),
    costCapPerTask: z.number(),
    costCapPerSession: z.number(),
    costCapPerDay: z.number(),
    maxParallelInstances: z.number(),
    rateLimitRpm: z.number(),
  }),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export interface ModelAdapter {
  complete(prompt: string, options?: Record<string, unknown>): Promise<string>;
  stream(prompt: string, options?: Record<string, unknown>): AsyncIterable<string>;
  getCost(tokens: { input: number; output: number }): number;
}
