import type { SubTask, SubTaskResult, CoordinatorConfig } from './types.js';
/**
 * Executes sub-tasks in parallel with concurrency control and timeout.
 */
export declare class SubAgentSpawner {
    private config;
    constructor(config?: Partial<CoordinatorConfig>);
    /**
     * Execute all sub-tasks respecting dependencies and concurrency limits.
     */
    executeAll(subTasks: SubTask[]): Promise<SubTaskResult[]>;
    private executeOne;
    private withTimeout;
}
//# sourceMappingURL=sub-agent-spawner.d.ts.map