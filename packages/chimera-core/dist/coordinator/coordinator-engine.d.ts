import { EventStream } from '../event-stream.js';
import type { LLMProvider } from '../session-orchestrator.js';
import type { AggregatedResult, CoordinatorConfig } from './types.js';
/**
 * Orchestrates parallel sub-agent execution:
 * decompose → spawn → aggregate.
 */
export declare class CoordinatorEngine {
    private decomposer;
    private spawner;
    private aggregator;
    private eventStream;
    private config;
    constructor(params: {
        provider: LLMProvider;
        eventStream: EventStream;
        config?: Partial<CoordinatorConfig>;
    });
    private safeEmit;
    /**
     * Execute a task using parallel sub-agents.
     */
    execute(task: string, context?: string): Promise<AggregatedResult>;
    /**
     * Assign providers to sub-tasks. If multiple providers are available,
     * distribute them for diversity.
     */
    private assignProviders;
}
//# sourceMappingURL=coordinator-engine.d.ts.map