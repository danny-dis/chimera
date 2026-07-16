import type { SubTask, SubTaskResult, CoordinatorConfig } from './types.js';
import { WorktreeIsolation } from '../agent/worktree-isolation.js';
import { DynamicConcurrencyEngine, type ConcurrencyOverrides } from '../agent/dynamic-concurrency-engine.js';
import { EventStream } from '../event-stream.js';
import type { ProviderConfig } from '@chimera/providers';
import type { ToolExecutorInterface, ToolRegistryInterface } from '../session-orchestrator.js';
export interface SpawnerBackoffConfig {
    baseBackoffMs?: number;
    maxBackoffMs?: number;
    maxRetries?: number;
}
/**
 * Executes sub-tasks in parallel with dynamic concurrency control,
 * rate-limit backoff, and timeout handling.
 */
export declare class SubAgentSpawner {
    private config;
    private eventStream?;
    private concurrencyEngine?;
    private rateLimitStates;
    private toolExecutor?;
    private toolRegistry?;
    private workspaceRoot?;
    private worktreeIsolation?;
    private baseBackoffMs;
    private maxBackoffMs;
    private maxRetries;
    constructor(eventStreamOrConfig?: EventStream | Partial<CoordinatorConfig>, config?: Partial<CoordinatorConfig>, concurrencyEngine?: DynamicConcurrencyEngine, backoffConfig?: SpawnerBackoffConfig, toolDeps?: {
        toolExecutor?: ToolExecutorInterface;
        toolRegistry?: ToolRegistryInterface;
        workspaceRoot?: string;
        worktreeIsolation?: WorktreeIsolation;
    });
    /**
     * Execute all sub-tasks respecting dependencies and concurrency limits.
     */
    executeAll(subTasks: SubTask[], options?: {
        providerConfig?: ProviderConfig;
        overrides?: ConcurrencyOverrides;
    }): Promise<SubTaskResult[]>;
    private executeWithBackoff;
    private executeOne;
    private isRateLimitError;
    private handleRateLimit;
    private calculateBackoff;
    private withTimeout;
}
//# sourceMappingURL=sub-agent-spawner.d.ts.map