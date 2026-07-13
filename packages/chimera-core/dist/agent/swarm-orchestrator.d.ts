/**
 * SwarmOrchestrator — manages 300+ agents with hierarchical aggregation,
 * multi-provider fan-out, and live progress events.
 *
 * Architecture:
 *   1. Task decomposition → heterogeneous subtasks
 *   2. Fan-out to provider pool (round-robin + capacity-weighted)
 *   3. Hierarchical aggregation: 300 → clusters of 15 → final merge
 *   4. Live progress events throughout
 */
import { EventEmitter } from 'events';
import type { LLMProvider } from '../session-orchestrator.js';
import type { EventStream } from '../event-stream.js';
import type { CostTracker } from '../cost-tracker.js';
export type SwarmAgentStatus = 'queued' | 'running' | 'suspended' | 'completed' | 'failed';
export interface SwarmTask {
    id: string;
    description: string;
    context?: string;
    priority: number;
    dependencies?: string[];
}
export interface SwarmAgent {
    id: string;
    taskId: string;
    status: SwarmAgentStatus;
    providerId: string;
    result?: string;
    error?: string;
    startedAt?: number;
    completedAt?: number;
    tokensUsed: number;
    costUsd: number;
}
export interface SwarmConfig {
    maxAgents: number;
    maxConcurrency: number;
    clusterSize: number;
    staggerDelayMs: number;
    taskTimeoutMs: number;
    budgetUsd?: number;
}
export interface SwarmResult {
    output: string;
    totalAgents: number;
    completed: number;
    failed: number;
    totalTokens: number;
    totalCostUsd: number;
    durationMs: number;
    clusterResults: string[];
    errors?: string[];
}
export interface ProviderPoolEntry {
    id: string;
    provider: LLMProvider;
    weight: number;
    activeCount: number;
    maxConcurrency: number;
}
export declare class SwarmOrchestrator extends EventEmitter {
    private config;
    private agents;
    private providerPool;
    private concurrencyEngine;
    private eventStream?;
    private costTracker?;
    private currentProviderIndex;
    constructor(deps?: {
        config?: Partial<SwarmConfig>;
        eventStream?: EventStream;
        costTracker?: CostTracker;
    });
    /**
     * Register providers for the swarm fan-out pool.
     */
    registerProviders(providers: Array<{
        id: string;
        provider: LLMProvider;
        weight?: number;
        maxConcurrency?: number;
    }>): void;
    /**
     * Execute a swarm of tasks across multiple providers.
     */
    execute(tasks: SwarmTask[]): Promise<SwarmResult>;
    /**
     * Get live stats about the swarm.
     */
    getStats(): {
        queued: number;
        running: number;
        suspended: number;
        completed: number;
        failed: number;
    };
    getAgent(agentId: string): SwarmAgent | undefined;
    getAllAgents(): SwarmAgent[];
    private selectProvider;
    private hierarchicalAggregate;
    private mergeClusterResults;
    private estimateCost;
    private withTimeout;
    private safeEmit;
}
//# sourceMappingURL=swarm-orchestrator.d.ts.map