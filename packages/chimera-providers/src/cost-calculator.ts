import { ModelRegistry } from './model-registry.js';
import { Message } from './types/provider.js';

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
  tokenCount: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

function estimateTokensFromMessages(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    total += Math.ceil(msg.content.length / 4);
    total += 4;
    if (msg.toolCalls?.length) {
      for (const tc of msg.toolCalls) {
        total += Math.ceil((tc.name + tc.arguments).length / 4);
      }
    }
  }
  return total;
}

export class CostCalculator {
  constructor(private registry: ModelRegistry) {}

  calculate(
    modelId: string,
    tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number },
  ): CostBreakdown {
    const model = this.registry.get(modelId);
    if (!model) {
      throw new Error(`Model not found in registry: ${modelId}`);
    }

    const inputCost = (tokens.input / 1_000_000) * model.pricing.inputPerMillion;
    const outputCost = (tokens.output / 1_000_000) * model.pricing.outputPerMillion;
    const cacheRead = tokens.cacheRead ?? 0;
    const cacheWrite = tokens.cacheWrite ?? 0;
    const cacheReadCost = cacheRead > 0 && model.pricing.cacheReadPerMillion
      ? (cacheRead / 1_000_000) * model.pricing.cacheReadPerMillion
      : 0;
    const cacheWriteCost = cacheWrite > 0 && model.pricing.cacheWritePerMillion
      ? (cacheWrite / 1_000_000) * model.pricing.cacheWritePerMillion
      : 0;

    return {
      inputCost,
      outputCost,
      cacheReadCost,
      cacheWriteCost,
      totalCost: inputCost + outputCost + cacheReadCost + cacheWriteCost,
      tokenCount: {
        input: tokens.input,
        output: tokens.output,
        cacheRead,
        cacheWrite,
      },
    };
  }

  calculateFromMessages(modelId: string, messages: Message[]): CostBreakdown {
    const inputTokens = estimateTokensFromMessages(messages);
    return this.calculate(modelId, { input: inputTokens, output: 0 });
  }

  estimateForTask(
    modelId: string,
    estimatedInputTokens: number,
    estimatedOutputRatio: number,
  ): CostBreakdown {
    const estimatedOutputTokens = Math.ceil(estimatedInputTokens * estimatedOutputRatio);
    return this.calculate(modelId, { input: estimatedInputTokens, output: estimatedOutputTokens });
  }
}
