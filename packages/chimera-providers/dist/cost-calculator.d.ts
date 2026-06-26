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
export declare class CostCalculator {
    private registry;
    constructor(registry: ModelRegistry);
    calculate(modelId: string, tokens: {
        input: number;
        output: number;
        cacheRead?: number;
        cacheWrite?: number;
    }): CostBreakdown;
    calculateFromMessages(modelId: string, messages: Message[]): CostBreakdown;
    estimateForTask(modelId: string, estimatedInputTokens: number, estimatedOutputRatio: number): CostBreakdown;
}
//# sourceMappingURL=cost-calculator.d.ts.map