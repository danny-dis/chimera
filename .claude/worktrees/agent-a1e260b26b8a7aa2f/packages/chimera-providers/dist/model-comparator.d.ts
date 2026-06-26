import { ModelRegistry, ModelEntry } from './model-registry.js';
export interface ModelComparison {
    models: ModelEntry[];
    costPerTask: Map<string, number>;
    qualityScore: Map<string, number>;
    costEfficiency: Map<string, number>;
    recommendation: string;
}
export declare class ModelComparator {
    private registry;
    private calculator;
    constructor(registry: ModelRegistry);
    compare(modelIds: string[], estimatedInputTokens: number, estimatedOutputTokens: number): ModelComparison;
    recommendForTask(taskComplexity: number, budget: number): string;
}
//# sourceMappingURL=model-comparator.d.ts.map