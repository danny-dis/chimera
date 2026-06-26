import type { LLMProvider } from '../session-orchestrator.js';
import type { SubTaskType, ModelPool } from './types.js';
export interface RoutingDecision {
    subTaskType: SubTaskType;
    selectedModel: string;
    reason: string;
}
export declare class LlmRouter {
    private provider;
    constructor(provider: LLMProvider);
    classify(description: string, pool: ModelPool): Promise<RoutingDecision>;
    classifyBatch(descriptions: {
        id: string;
        description: string;
    }[], pool: ModelPool): Promise<Map<string, RoutingDecision>>;
}
//# sourceMappingURL=llm-router.d.ts.map