import type { LLMProvider } from '../session-orchestrator.js';
import type { SubTaskResult, AggregatedResult } from './types.js';
export declare class ResultAggregator {
    private provider;
    constructor(provider: LLMProvider);
    aggregate(results: SubTaskResult[]): Promise<AggregatedResult>;
}
//# sourceMappingURL=result-aggregator.d.ts.map