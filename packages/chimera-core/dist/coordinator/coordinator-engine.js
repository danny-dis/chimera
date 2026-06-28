"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoordinatorEngine = void 0;
const task_decomposer_js_1 = require("./task-decomposer.js");
const sub_agent_spawner_js_1 = require("./sub-agent-spawner.js");
const result_aggregator_js_1 = require("./result-aggregator.js");
const DEFAULT_CONFIG = {
    maxConcurrency: 4,
    taskTimeoutMs: 60_000,
    conflictResolution: 'auto',
};
/**
 * Orchestrates parallel sub-agent execution:
 * decompose → spawn → aggregate.
 */
class CoordinatorEngine {
    decomposer;
    spawner;
    aggregator;
    eventStream;
    config;
    constructor(params) {
        this.decomposer = new task_decomposer_js_1.TaskDecomposer(params.provider);
        this.spawner = new sub_agent_spawner_js_1.SubAgentSpawner(params.config);
        this.aggregator = new result_aggregator_js_1.ResultAggregator(params.provider);
        this.eventStream = params.eventStream;
        this.config = { ...DEFAULT_CONFIG, ...params.config };
    }
    safeEmit(event) {
        try {
            this.eventStream.append(event);
        }
        catch { /* ignore */ }
    }
    /**
     * Execute a task using parallel sub-agents.
     */
    async execute(task, context) {
        // Step 1: Decompose
        this.safeEmit({
            type: 'task_classified',
            complexity: { score: 0.8, dimensions: { decomposability: 0.9 } },
            estimatedCost: 0,
        });
        const decomposition = await this.decomposer.decompose(task, context);
        this.safeEmit({
            type: 'agent_spawned',
            agentId: 'coordinator',
            role: 'writer',
            provider: 'coordinator',
            model: 'decomposer',
        });
        // If single task, no need for parallel execution
        if (decomposition.subTasks.length <= 1) {
            const subTask = decomposition.subTasks[0];
            if (!subTask) {
                return { output: '', conflicts: [], resolved: true, subTaskResults: [], totalTokens: 0 };
            }
            const results = await this.spawner.executeAll([subTask]);
            return this.aggregator.aggregate(results);
        }
        // Step 2: Assign providers to sub-tasks
        const assigned = this.assignProviders(decomposition.subTasks);
        // Step 3: Execute in parallel
        const results = await this.spawner.executeAll(assigned);
        // Step 4: Aggregate results
        const aggregated = await this.aggregator.aggregate(results);
        // Step 5: Handle unresolved conflicts
        if (!aggregated.resolved && this.config.conflictResolution === 'escalate') {
            this.safeEmit({
                type: 'handoff_triggered',
                fromAgent: 'coordinator',
                toAgent: 'user',
                reason: 'task_boundary',
                format: 'compact',
                tokenCount: aggregated.totalTokens,
                claimIds: [],
            });
        }
        return aggregated;
    }
    /**
     * Assign providers to sub-tasks. If multiple providers are available,
     * distribute them for diversity.
     */
    assignProviders(subTasks) {
        // All sub-tasks use the same provider for now
        // In the future, this could distribute across providers based on task characteristics
        return subTasks;
    }
}
exports.CoordinatorEngine = CoordinatorEngine;
//# sourceMappingURL=coordinator-engine.js.map