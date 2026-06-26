import type { LLMProvider } from '../session-orchestrator.js';
import type { SubTaskType, ModelPool } from './types.js';

const CLASSIFIER_PROMPT = `You are a task classifier for Chimera's multi-agent system.

Given a sub-task description, classify it into one of these types and pick the best model from the pool.

Available models:
{{MODELS}}

Rules:
- Match the sub-task to the model whose specialties best fit
- Prefer cheaper models when quality is comparable
- Consider the full context, not just keywords

Respond with JSON only:
{"subTaskType":"<type>","selectedModel":"<modelId>","reason":"<brief>"}`;

export interface RoutingDecision {
  subTaskType: SubTaskType;
  selectedModel: string;
  reason: string;
}

export class LlmRouter {
  constructor(private provider: LLMProvider) {}

  async classify(
    description: string,
    pool: ModelPool,
  ): Promise<RoutingDecision> {
    const modelsList = pool.models
      .map((m) => `- ${m.modelId} (tier: ${m.tier}, specialties: ${m.specialties.join(', ')})`)
      .join('\n');

    const prompt = CLASSIFIER_PROMPT.replace('{{MODELS}}', modelsList);

    try {
      const result = await this.provider.complete(
        [
          { role: 'system', content: prompt },
          { role: 'user', content: `Classify this sub-task:\n${description}` },
        ],
        { responseFormat: 'json_object', temperature: 0 },
      );

      const parsed = JSON.parse(result.content);
      return {
        subTaskType: parsed.subTaskType as SubTaskType,
        selectedModel: parsed.selectedModel as string,
        reason: parsed.reason as string,
      };
    } catch {
      return {
        subTaskType: 'general',
        selectedModel: pool.models[0]?.modelId ?? '',
        reason: 'classification failed, using fallback',
      };
    }
  }

  async classifyBatch(
    descriptions: { id: string; description: string }[],
    pool: ModelPool,
  ): Promise<Map<string, RoutingDecision>> {
    const results = await Promise.all(
      descriptions.map(async (d) => {
        const decision = await this.classify(d.description, pool);
        return [d.id, decision] as const;
      }),
    );

    return new Map(results);
  }
}