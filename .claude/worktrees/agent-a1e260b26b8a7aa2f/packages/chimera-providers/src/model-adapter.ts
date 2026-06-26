import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  name: z.string().min(1),
  provider: z.string().min(1),
  baseUrl: z.string().optional(),
  model: z.string().min(1, 'model must not be empty'),
  // apiKey is optional because some local providers (Ollama) don't need one.
  // Length is checked at provider-construction time via resolveApiKey().
  apiKey: z.string().optional(),
  role: z.enum(['writer', 'reviewer', 'challenger']),
  constraints: z.object({
    maxTokensPerTurn: z.number().positive(),
    costCapPerTask: z.number().nonnegative(),
    costCapPerSession: z.number().nonnegative(),
    costCapPerDay: z.number().nonnegative(),
    maxParallelInstances: z.number().positive(),
    rateLimitRpm: z.number().positive(),
  }),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export interface ModelAdapter {
  complete(prompt: string, options?: Record<string, unknown>): Promise<string>;
  stream(prompt: string, options?: Record<string, unknown>): AsyncIterable<string>;
  getCost(tokens: { input: number; output: number }): number;
}
