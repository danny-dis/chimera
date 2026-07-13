"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwarmOrchestrator = void 0;
const events_1 = require("events");
const async_semaphore_js_1 = require("./async-semaphore.js");
const dynamic_concurrency_engine_js_1 = require("./dynamic-concurrency-engine.js");
// ── SwarmOrchestrator ────────────────────────────────────────────────
const DEFAULT_CONFIG = {
    maxAgents: 300,
    maxConcurrency: 50,
    clusterSize: 15,
    staggerDelayMs: 100,
    taskTimeoutMs: 120_000,
};
class SwarmOrchestrator extends events_1.EventEmitter {
    config;
    agents = new Map();
    providerPool = [];
    concurrencyEngine;
    eventStream;
    costTracker;
    currentProviderIndex = 0;
    constructor(deps = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...deps.config };
        this.eventStream = deps.eventStream;
        this.costTracker = deps.costTracker;
        this.concurrencyEngine = new dynamic_concurrency_engine_js_1.DynamicConcurrencyEngine();
    }
    /**
     * Register providers for the swarm fan-out pool.
     */
    registerProviders(providers) {
        this.providerPool = providers.map((p) => ({
            id: p.id,
            provider: p.provider,
            weight: p.weight ?? 1,
            activeCount: 0,
            maxConcurrency: p.maxConcurrency ?? 10,
        }));
    }
    /**
     * Execute a swarm of tasks across multiple providers.
     */
    async execute(tasks) {
        const startTime = Date.now();
        this.agents.clear();
        if (this.providerPool.length === 0) {
            throw new Error('No providers registered. Call registerProviders() first.');
        }
        const cappedTasks = tasks.slice(0, this.config.maxAgents);
        if (cappedTasks.length < tasks.length) {
            this.emit('swarm_warning', { message: `Capped from ${tasks.length} to ${this.config.maxAgents} agents` });
        }
        // Create agent entries
        for (const task of cappedTasks) {
            const agentId = `swarm-${task.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            this.agents.set(agentId, {
                id: agentId,
                taskId: task.id,
                status: 'queued',
                providerId: '',
                tokensUsed: 0,
                costUsd: 0,
            });
        }
        this.safeEmit({ type: 'swarm_started', taskCount: cappedTasks.length, maxConcurrency: this.config.maxConcurrency });
        // Execute with staggered fan-out
        const semaphore = new async_semaphore_js_1.AsyncSemaphore(this.config.maxConcurrency);
        const completedResults = [];
        const failedTasks = [];
        const agentErrors = [];
        const executeTask = async (task) => {
            await semaphore.acquire();
            const agentId = [...this.agents.entries()].find(([_, a]) => a.taskId === task.id && a.status === 'queued')?.[0];
            if (!agentId) {
                semaphore.release();
                return;
            }
            const agent = this.agents.get(agentId);
            const primaryProvider = this.selectProvider();
            if (!primaryProvider || typeof primaryProvider.provider?.complete !== 'function') {
                agent.status = 'failed';
                agent.error = !primaryProvider ? 'No available provider' : 'Provider missing a usable complete()';
                failedTasks.push(task.id);
                semaphore.release();
                return;
            }
            agent.status = 'running';
            agent.startedAt = Date.now();
            this.emit('agent_started', { agentId, taskId: task.id, providerId: primaryProvider.id });
            // Try the provider pool in sequence so a single broken/failed provider
            // (e.g. a 401 auth error) does not sink the whole swarm. The first one
            // that returns usable content wins.
            const pool = [primaryProvider, ...this.providerPool.filter((p) => p.id !== primaryProvider.id)];
            let lastErr;
            let completed = false;
            for (const provider of pool) {
                if (typeof provider.provider?.complete !== 'function')
                    continue;
                agent.providerId = provider.id;
                provider.activeCount++;
                try {
                    const result = await this.withTimeout(provider.provider.complete([
                        { role: 'system', content: 'You are a swarm sub-agent. Execute the task and return only the result.' },
                        { role: 'user', content: task.context ? `TASK: ${task.description}\n\nCONTEXT:\n${task.context}` : `TASK: ${task.description}` },
                    ], { temperature: 0.3 }), this.config.taskTimeoutMs);
                    agent.status = 'completed';
                    agent.result = result.content;
                    agent.completedAt = Date.now();
                    agent.tokensUsed = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
                    const cost = this.estimateCost(provider.id, agent.tokensUsed);
                    agent.costUsd = cost;
                    completedResults.push({ taskId: task.id, output: result.content });
                    this.emit('agent_completed', { agentId, taskId: task.id, tokensUsed: agent.tokensUsed });
                    completed = true;
                    break;
                }
                catch (err) {
                    lastErr = err;
                    agentErrors.push(`agent ${agentId} via ${provider.id}: ${err instanceof Error ? err.message : String(err)}`);
                    this.emit('agent_failed', { agentId, taskId: task.id, error: err instanceof Error ? err.message : String(err) });
                }
                finally {
                    provider.activeCount--;
                }
            }
            if (!completed) {
                agent.status = 'failed';
                agent.error = lastErr instanceof Error ? lastErr.message : String(lastErr);
                agent.completedAt = Date.now();
                failedTasks.push(task.id);
            }
            semaphore.release();
        };
        // Staggered launch
        const promises = [];
        for (let i = 0; i < cappedTasks.length; i++) {
            promises.push(executeTask(cappedTasks[i]));
            if (i < cappedTasks.length - 1 && this.config.staggerDelayMs > 0) {
                await new Promise((r) => setTimeout(r, this.config.staggerDelayMs));
            }
        }
        await Promise.allSettled(promises);
        // Hierarchical aggregation
        const clusterResults = await this.hierarchicalAggregate(completedResults);
        const finalOutput = await this.mergeClusterResults(clusterResults);
        const totalTokens = [...this.agents.values()].reduce((s, a) => s + a.tokensUsed, 0);
        const totalCost = [...this.agents.values()].reduce((s, a) => s + a.costUsd, 0);
        this.safeEmit({
            type: 'swarm_completed',
            totalAgents: this.agents.size,
            completed: completedResults.length,
            failed: failedTasks.length,
            totalTokens,
            totalCostUsd: totalCost,
            durationMs: Date.now() - startTime,
        });
        return {
            output: finalOutput,
            totalAgents: this.agents.size,
            completed: completedResults.length,
            failed: failedTasks.length,
            totalTokens,
            totalCostUsd: totalCost,
            durationMs: Date.now() - startTime,
            clusterResults,
            ...(agentErrors.length > 0 ? { errors: agentErrors } : {}),
        };
    }
    /**
     * Get live stats about the swarm.
     */
    getStats() {
        const stats = { queued: 0, running: 0, suspended: 0, completed: 0, failed: 0 };
        for (const agent of this.agents.values()) {
            stats[agent.status]++;
        }
        return stats;
    }
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    getAllAgents() {
        return [...this.agents.values()];
    }
    // ── Private ────────────────────────────────────────────────────────
    selectProvider() {
        const available = this.providerPool.filter((p) => p.activeCount < p.maxConcurrency);
        if (available.length === 0)
            return null;
        // Weighted round-robin
        const totalWeight = available.reduce((s, p) => s + p.weight, 0);
        let rand = Math.random() * totalWeight;
        for (const p of available) {
            rand -= p.weight;
            if (rand <= 0)
                return p;
        }
        return available[available.length - 1];
    }
    async hierarchicalAggregate(results) {
        if (results.length === 0)
            return [];
        if (results.length <= this.config.clusterSize) {
            return results.map((r) => r.output);
        }
        const clusters = [];
        for (let i = 0; i < results.length; i += this.config.clusterSize) {
            clusters.push(results.slice(i, i + this.config.clusterSize).map((r) => r.output));
        }
        const clusterResults = [];
        for (const cluster of clusters) {
            const merged = cluster.join('\n\n---\n\n');
            clusterResults.push(merged.length > 5000 ? merged.slice(0, 5000) + '\n[truncated]' : merged);
        }
        return clusterResults;
    }
    async mergeClusterResults(clusterResults) {
        if (clusterResults.length === 0)
            return '';
        if (clusterResults.length === 1)
            return clusterResults[0];
        // Simple concatenation — in production this would use an LLM merge
        return clusterResults.join('\n\n=== CLUSTER BOUNDARY ===\n\n');
    }
    estimateCost(_providerId, tokens) {
        // Rough estimate: $0.002 per 1K tokens (average across providers)
        return (tokens / 1000) * 0.002;
    }
    withTimeout(promise, ms) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Swarm agent timed out after ${ms}ms`)), ms);
            promise.then((val) => { clearTimeout(timer); resolve(val); }, (err) => { clearTimeout(timer); reject(err); });
        });
    }
    safeEmit(event) {
        try {
            this.emit(event.type, event);
        }
        catch { /* ignore */ }
        try {
            this.eventStream?.append(event);
        }
        catch { /* ignore */ }
    }
}
exports.SwarmOrchestrator = SwarmOrchestrator;
//# sourceMappingURL=swarm-orchestrator.js.map