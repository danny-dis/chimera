"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CostCalculator = void 0;
function estimateTokensFromMessages(messages) {
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
class CostCalculator {
    registry;
    constructor(registry) {
        this.registry = registry;
    }
    calculate(modelId, tokens) {
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
    calculateFromMessages(modelId, messages) {
        const inputTokens = estimateTokensFromMessages(messages);
        return this.calculate(modelId, { input: inputTokens, output: 0 });
    }
    estimateForTask(modelId, estimatedInputTokens, estimatedOutputRatio) {
        const estimatedOutputTokens = Math.ceil(estimatedInputTokens * estimatedOutputRatio);
        return this.calculate(modelId, { input: estimatedInputTokens, output: estimatedOutputTokens });
    }
}
exports.CostCalculator = CostCalculator;
//# sourceMappingURL=cost-calculator.js.map