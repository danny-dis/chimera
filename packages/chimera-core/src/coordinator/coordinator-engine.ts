import { EventStream } from '../event-stream.js';
import type { LLMProvider } from '../session-orchestrator.js';
import { TaskDecomposer } from './task-decomposer.js';
import { SubAgentSpawner } from './sub-agent-spawner.js';
import { ResultAggregator } from './result-aggregator.js';
import type { AggregatedResult, CoordinatorConfig, SubTask } from './types.js';

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrency: 4,
  taskTimeoutMs: 60_000,
  conflictResolution: 'auto',
};

/**
 * Orchestrates parallel sub-agent execution:
 * decompose → spawn → aggregate.
 */
export class CoordinatorEngine {
  private decomposer: TaskDecomposer;
  private spawner: SubAgentSpawner;
  private aggregator: ResultAggregator;
  private eventStream: EventStream;
  private config: CoordinatorConfig;

  constructor(params: {
    provider: LLMProvider;
    eventStream: EventStream;
    config?: Partial<CoordinatorConfig>;
  }) {
    this.decomposer = new TaskDecomposer(params.provider);
    this.spawner = new SubAgentSpawner(params.config);
    this.aggregator = new ResultAggregator(params.provider);
    this.eventStream = params.eventStream;
    this.config = { ...DEFAULT_CONFIG, ...params.config };
  }

  private safeEmit(event: unknown): void {
    try { this.eventStream.append(event as Parameters<EventStream['append']>[0]); } catch { /* ignore */ }
  }

  /**
   * Execute a task using parallel sub-agents.
   */
  async execute(task: string, context?: string): Promise<AggregatedResult> {
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
  private assignProviders(subTasks: SubTask[]): SubTask[] {
    // All sub-tasks use the same provider for now
    // In the future, this could distribute across providers based on task characteristics
    return subTasks;
  }
}
