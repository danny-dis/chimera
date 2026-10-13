import { EventStream } from '../event-stream.js';
import type { LLMProvider, ToolExecutorInterface, ToolRegistryInterface } from '../session-orchestrator.js';
import { TaskDecomposer } from './task-decomposer.js';
import { SubAgentSpawner } from './sub-agent-spawner.js';
import { ResultAggregator } from './result-aggregator.js';
import type { AggregatedResult, CoordinatorConfig, SubTask, SubTaskResult } from './types.js';
import { withAbort } from '../utils/abort.js';

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
  private tools?: SubTask['tools'];
  private signal?: AbortSignal;

  constructor(params: {
    provider: LLMProvider;
    eventStream: EventStream;
    config?: Partial<CoordinatorConfig>;
    toolDeps?: ConstructorParameters<typeof SubAgentSpawner>[4];
    tools?: SubTask['tools'];
  }) {
    this.signal = params.toolDeps?.signal;
    this.config = { ...DEFAULT_CONFIG, ...params.config };
    if (params.toolDeps?.toolExecutor && !['ask', 'plan', 'review'].includes(params.toolDeps.mode ?? 'auto')) {
      // ponytail: serialize shared-root writers until isolated merge-back exists.
      this.config.maxConcurrency = 1;
    }
    const provider: LLMProvider = {
      complete: async (messages, options) => {
        const signal = this.signal && options?.signal ? AbortSignal.any([this.signal, options.signal])
          : options?.signal ?? this.signal;
        const result = await withAbort(() => params.provider.complete(messages, { ...options, signal }), signal);
        signal?.throwIfAborted();
        return result;
      },
    };
    this.decomposer = new TaskDecomposer(provider);
    this.spawner = new SubAgentSpawner(params.eventStream, this.config, undefined, undefined, params.toolDeps);
    this.aggregator = new ResultAggregator(provider);
    this.eventStream = params.eventStream;
    this.tools = params.tools;
  }

  private safeEmit(event: unknown): void {
    try { this.eventStream.append(event as Parameters<EventStream['append']>[0]); } catch { /* ignore */ }
  }

  /**
   * Execute a task using parallel sub-agents.
   *
   * @param task       The task description (used only when `preDecomposed` is not supplied).
   * @param context    Optional context forwarded to the decomposer.
   * @param preDecomposed  When the caller has already decomposed the task into
   *                       SubTasks (e.g. DeliberationEngine.runHive with model
   *                       routing + tools injection), the decomposer is skipped
   *                       and these SubTasks are executed directly.
   */
  async execute(task: string, context?: string, preDecomposed?: SubTask[]): Promise<AggregatedResult> {
    this.signal?.throwIfAborted();
    // Step 1: Decompose (or use pre-decomposed subtasks from caller)
    this.safeEmit({
      type: 'task_classified',
      complexity: { score: 0.8, dimensions: { decomposability: 0.9 } },
      estimatedCost: 0,
    });

    const decomposition = preDecomposed
      ? { subTasks: preDecomposed, strategy: 'parallel' as const, rationale: 'pre-decomposed by caller' }
      : await withAbort(() => this.decomposer.decompose(task, context), this.signal);
    this.signal?.throwIfAborted();

    this.safeEmit({
      type: 'agent_spawned',
      agentId: 'coordinator',
      role: 'writer',
      provider: 'coordinator',
      model: 'decomposer',
    });

    const assigned = this.assignProviders(decomposition.subTasks);
    // If single task, no need for parallel execution
    if (assigned.length <= 1) {
      const subTask = assigned[0];
      if (!subTask) {
        return { output: 'No subtasks were produced', conflicts: [], resolved: false, subTaskResults: [], totalTokens: 0 };
      }
      const results = await this.spawner.executeAll([subTask]);
      return this.aggregateResults(results);
    }


    // Step 3: Execute in parallel
    const results = await this.spawner.executeAll(assigned);

    // Step 4: Aggregate results
    const aggregated = await this.aggregateResults(results);

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
    return subTasks.map(task => ({ ...task, tools: this.tools
      ? this.tools.filter(tool => !task.tools || task.tools.some(allowed => allowed.name === tool.name))
      : task.tools }));
  }

  private async aggregateResults(results: SubTaskResult[]): Promise<AggregatedResult> {
    try {
      return await withAbort(() => this.aggregator.aggregate(results, this.signal), this.signal);
    } catch (error) {
      if (this.signal?.aborted) return this.aggregator.aggregate(results, this.signal);
      throw error;
    }
  }
}
