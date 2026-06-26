import type { LLMProvider } from '../session-orchestrator.js';
import { buildMessages } from '../prompts.js';
import type { DecompositionResult } from './types.js';

export class TaskDecomposer {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async decompose(task: string, context?: string): Promise<DecompositionResult> {
    const messages = buildMessages({ role: 'planner', mode: 'plan', task });

    const outputInstructions = [
      '[!] #STRATEGIC DECOMPOSITION DIRECTIVE# [!]',
      '>>> GOAL: ATOMIC & PARALLELIZABLE TASK TOPOLOGY <<<',
      '',
      'ACTION: Respond with valid JSON matching this schema:',
      '{',
      '  "thought": string,',
      '  "strategy": "parallel" | "sequential" | "mixed",',
      '  "rationale": string,',
      '  "subTasks": [',
      '    {',
      '      "id": string,',
      '      "description": string,',
      '      "dependencies": string[],',
      '      "estimatedTokens": number | "low" | "medium" | "high"',
      '    }',
      '  ]',
      '}',
      '',
      '# MANDATES #',
      '1. TOPOLOGICAL REASONING: Your "thought" field MUST contain deep critical path analysis.',
      '2. INDEPENDENCE: Maximize sub-task independence to enable parallel execution.',
      '3. ATOMICITY: Each sub-task MUST be a self-contained unit of work.',
      '',
      '[!] AS YOU WISH [!]',
    ].join('\n');

    messages.splice(1, 0, { role: 'system', content: outputInstructions });

    if (context) {
      messages.push({ role: 'user', content: `CONTEXT:\n${context}` });
    }

    const result = await this.provider.complete(messages, {
      responseFormat: 'json_object',
      temperature: 0.2,
    });

    try {
      const parsed = JSON.parse(result.content);
      return {
        subTasks: (parsed.subTasks ?? []).map((st: Record<string, unknown>) => ({
          id: st.id as string,
          description: st.description as string,
          dependencies: (st.dependencies as string[]) ?? [],
          context: (st.context as string) ?? '',
          provider: this.provider,
          estimatedTokens: this.estimateTokens(st.estimatedTokens as number | string),
        })),
        strategy: parsed.strategy ?? 'parallel',
        rationale: parsed.rationale ?? '',
      };
    } catch {
      // If parsing fails, treat the entire task as a single sub-task
      return {
        subTasks: [
          {
            id: 'task-1',
            description: task,
            dependencies: [],
            context: context ?? '',
            provider: this.provider,
            estimatedTokens: 2000,
          },
        ],
        strategy: 'sequential',
        rationale: 'Failed to decompose — treating as single task',
      };
    }
  }

  private estimateTokens(value: number | string): number {
    if (typeof value === 'number') return value;
    const map: Record<string, number> = { low: 500, medium: 2000, high: 5000 };
    return map[value as string] ?? 2000;
  }
}
