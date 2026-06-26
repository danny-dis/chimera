import { z } from 'zod';
import { sideQuery } from '../side-query.js';
import type { LongTermMemory } from './long-term-memory.js';

export const ExtractionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  model: z.string().optional(),
  minImportance: z.number().min(0).max(1).default(0.3),
  maxTokens: z.number().positive().default(512),
  timeoutMs: z.number().positive().default(15_000),
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
 * Turn-level extraction of durable facts from conversation messages.
 * Uses sideQuery (cheap LLM) to classify and score facts, then writes
 * qualifying facts to LongTermMemory.
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
      if (fact.importance >= this.config.minImportance) {
        await this.memory.write({
          content: fact.content,
          topic: fact.type,
          importance: fact.importance,
          source: 'agent',
          sessionId: input.sessionId,
          tags: fact.tags ?? [],
        });
      }
    }

    return input.messages.length;
  }
}
