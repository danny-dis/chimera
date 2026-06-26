import type { LLMProvider } from '../session-orchestrator.js';
import type { SubTaskResult } from './types.js';
import type { RoutingDecision } from './llm-router.js';
export interface RecursiveConfig {
    maxDepth: number;
    confidenceThreshold: number;
    budgetUsd: number;
}
export declare class RecursiveDispatcher {
    private config;
    constructor(config?: Partial<RecursiveConfig>);
    shouldRetry(analysis: {
        confidence: number;
        blindSpots: string[];
        conflicts: {
            type: string;
        }[];
    }, depth: number, spentUsd: number): boolean;
    identifyWeakSubtasks(results: SubTaskResult[], analysis: {
        blindSpots: string[];
        conflicts: {
            subTaskIds: string[];
            type: string;
        }[];
        confidence: number;
    }): string[];
    reDispatch(weakIds: string[], originalResults: SubTaskResult[], routingDecisions: Map<string, RoutingDecision>, providers: Map<string, LLMProvider>, originalTask: string): Promise<SubTaskResult[]>;
    private pickAlternativeModel;
}
//# sourceMappingURL=recursive-dispatcher.d.ts.map