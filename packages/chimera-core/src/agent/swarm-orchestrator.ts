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
import { AsyncSemaphore } from './async-semaphore.js';
import { DynamicConcurrencyEngine, type ConcurrencyOverrides } from './dynamic-concurrency-engine.js';
import type { LLMProvider } from '../session-orchestrator.js';
import type { EventStream } from '../event-stream.js';
import type { CostTracker } from '../cost-tracker.js';

// ── Types ────────────────────────────────────────────────────────────

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
}

export interface ProviderPoolEntry {
  id: string;
  provider: LLMProvider;
  weight: number;
  activeCount: number;
  maxConcurrency: number;
}

// ── SwarmOrchestrator ────────────────────────────────────────────────

const DEFAULT_CONFIG: SwarmConfig = {
  maxAgents: 300,
  maxConcurrency: 50,
  clusterSize: 15,
  staggerDelayMs: 100,
  taskTimeoutMs: 120_000,
};

export class SwarmOrchestrator extends EventEmitter {
  private config: SwarmConfig;
  private agents: Map<string, SwarmAgent> = new Map();
  private providerPool: ProviderPoolEntry[] = [];
  private concurrencyEngine: DynamicConcurrencyEngine;
  private eventStream?: EventStream;
  private costTracker?: CostTracker;
  private currentProviderIndex = 0;

  constructor(deps: {
    config?: Partial<SwarmConfig>;
    eventStream?: EventStream;
    costTracker?: CostTracker;
  } = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...deps.config };
    this.eventStream = deps.eventStream;
    this.costTracker = deps.costTracker;
    this.concurrencyEngine = new DynamicConcurrencyEngine();
  }

  /**
   * Register providers for the swarm fan-out pool.
   */
  registerProviders(providers: Array<{ id: string; provider: LLMProvider; weight?: number; maxConcurrency?: number }>): void {
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
  async execute(tasks: SwarmTask[]): Promise<SwarmResult> {
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
    const semaphore = new AsyncSemaphore(this.config.maxConcurrency);
    const completedResults: Array<{ taskId: string; output: string }> = [];
    const failedTasks: string[] = [];

    const executeTask = async (task: SwarmTask): Promise<void> => {
      await semaphore.acquire();
      const agentId = [...this.agents.entries()].find(([_, a]) => a.taskId === task.id && a.status === 'queued')?.[0];
      if (!agentId) { semaphore.release(); return; }

      const agent = this.agents.get(agentId)!;
      const provider = this.selectProvider();
      if (!provider) {
        agent.status = 'failed';
        agent.error = 'No available provider';
        failedTasks.push(task.id);
        semaphore.release();
        return;
      }

      agent.status = 'running';
      agent.providerId = provider.id;
      agent.startedAt = Date.now();
      provider.activeCount++;
      this.emit('agent_started', { agentId, taskId: task.id, providerId: provider.id });

      try {
        const result = await this.withTimeout(
          provider.provider.complete(
            [{ role: 'user', content: task.context ? `TASK: ${task.description}\n\nCONTEXT:\n${task.context}` : `TASK: ${task.description}` }],
            { temperature: 0.3 },
          ),
          this.config.taskTimeoutMs,
        );

        agent.status = 'completed';
        agent.result = result.content;
        agent.completedAt = Date.now();
        agent.tokensUsed = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
        const cost = this.estimateCost(provider.id, agent.tokensUsed);
        agent.costUsd = cost;
        completedResults.push({ taskId: task.id, output: result.content });
        this.emit('agent_completed', { agentId, taskId: task.id, tokensUsed: agent.tokensUsed });
      } catch (err) {
        agent.status = 'failed';
        agent.error = err instanceof Error ? err.message : String(err);
        agent.completedAt = Date.now();
        failedTasks.push(task.id);
        this.emit('agent_failed', { agentId, taskId: task.id, error: agent.error });
      } finally {
        provider.activeCount--;
        semaphore.release();
      }
    };

    // Staggered launch
    const promises: Promise<void>[] = [];
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
    };
  }

  /**
   * Get live stats about the swarm.
   */
  getStats(): { queued: number; running: number; suspended: number; completed: number; failed: number } {
    const stats = { queued: 0, running: 0, suspended: 0, completed: 0, failed: 0 };
    for (const agent of this.agents.values()) {
      stats[agent.status]++;
    }
    return stats;
  }

  getAgent(agentId: string): SwarmAgent | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): SwarmAgent[] {
    return [...this.agents.values()];
  }

  // ── Private ────────────────────────────────────────────────────────

  private selectProvider(): ProviderPoolEntry | null {
    const available = this.providerPool.filter((p) => p.activeCount < p.maxConcurrency);
    if (available.length === 0) return null;

    // Weighted round-robin
    const totalWeight = available.reduce((s, p) => s + p.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const p of available) {
      rand -= p.weight;
      if (rand <= 0) return p;
    }
    return available[available.length - 1];
  }

  private async hierarchicalAggregate(results: Array<{ taskId: string; output: string }>): Promise<string[]> {
    if (results.length === 0) return [];
    if (results.length <= this.config.clusterSize) {
      return results.map((r) => r.output);
    }

    const clusters: string[][] = [];
    for (let i = 0; i < results.length; i += this.config.clusterSize) {
      clusters.push(results.slice(i, i + this.config.clusterSize).map((r) => r.output));
    }

    const clusterResults: string[] = [];
    for (const cluster of clusters) {
      const merged = cluster.join('\n\n---\n\n');
      clusterResults.push(merged.length > 5000 ? merged.slice(0, 5000) + '\n[truncated]' : merged);
    }

    return clusterResults;
  }

  private async mergeClusterResults(clusterResults: string[]): Promise<string> {
    if (clusterResults.length === 0) return '';
    if (clusterResults.length === 1) return clusterResults[0];

    // Simple concatenation — in production this would use an LLM merge
    return clusterResults.join('\n\n=== CLUSTER BOUNDARY ===\n\n');
  }

  private estimateCost(_providerId: string, tokens: number): number {
    // Rough estimate: $0.002 per 1K tokens (average across providers)
    return (tokens / 1000) * 0.002;
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Swarm agent timed out after ${ms}ms`)), ms);
      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); },
      );
    });
  }

  private safeEmit(event: unknown): void {
    try { this.emit((event as { type: string }).type, event); } catch { /* ignore */ }
    try { this.eventStream?.append(event as Parameters<EventStream['append']>[0]); } catch { /* ignore */ }
  }
}
