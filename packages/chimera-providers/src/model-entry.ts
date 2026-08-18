import { z } from 'zod';

export const ModelEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  contextWindow: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  pricing: z.object({
    inputPerMillion: z.number().nonnegative(),
    outputPerMillion: z.number().nonnegative(),
    cacheReadPerMillion: z.number().nonnegative().optional(),
    cacheWritePerMillion: z.number().nonnegative().optional(),
  }),
  capabilities: z.object({
    toolCalling: z.boolean(),
    structuredOutput: z.boolean(),
    vision: z.boolean(),
    reasoning: z.boolean(),
    parallelToolCalls: z.boolean(),
  }),
  degradationThreshold: z.number().min(0).max(1),
  tier: z.enum(['cheap', 'mid', 'frontier', 'reasoning']),
  releaseDate: z.string().optional(),
  deprecated: z.boolean().optional(),
  replacement: z.string().optional(),
  fetchedAt: z.number().optional(),
});

export type ModelEntry = z.infer<typeof ModelEntrySchema>;

// ponytail: minimal registry interface — the 1006-line ModelRegistry class
// (hardcoded models, OpenRouter cache, merge logic) was research-grade dead
// weight for a local 1-3 agent CLI. Replaced with a Map wrapper. Add back
// dynamic metadata fetching only when running 300+ agents across providers.
export interface ModelRegistry {
  get(id: string): ModelEntry | undefined;
  getAll(): ModelEntry[];
  register(entry: ModelEntry): void;
}

export class SimpleModelRegistry implements ModelRegistry {
  private models = new Map<string, ModelEntry>();

  constructor(entries: ModelEntry[] = []) {
    for (const e of entries) this.models.set(e.id, e);
  }

  get(id: string): ModelEntry | undefined {
    return this.models.get(id);
  }

  getAll(): ModelEntry[] {
    return Array.from(this.models.values());
  }

  register(entry: ModelEntry): void {
    ModelEntrySchema.parse(entry);
    this.models.set(entry.id, entry);
  }
}
