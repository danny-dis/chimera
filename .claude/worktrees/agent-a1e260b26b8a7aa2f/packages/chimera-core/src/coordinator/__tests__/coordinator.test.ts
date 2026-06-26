import { describe, it, expect, vi } from 'vitest';
import { TaskDecomposer } from '../task-decomposer.js';
import { SubAgentSpawner } from '../sub-agent-spawner.js';
import { ResultAggregator } from '../result-aggregator.js';
import { CoordinatorEngine } from '../coordinator-engine.js';
import { EventStream } from '../../event-stream.js';
import type { LLMProvider } from '../../session-orchestrator.js';

function mockProvider(responses: string[]): LLMProvider {
  let callIndex = 0;
  return {
    async complete(_messages) {
      const content = responses[callIndex] ?? responses[responses.length - 1] ?? '{}';
      callIndex++;
      return {
        content,
        usage: { inputTokens: 100, outputTokens: 200 },
      };
    },
  };
}

describe('TaskDecomposer', () => {
  it('decomposes a task into sub-tasks', async () => {
    const provider = mockProvider([
      JSON.stringify({
        strategy: 'parallel',
        rationale: 'Three independent parts',
        subTasks: [
          { id: 'task-1', description: 'Implement auth module', dependencies: [], estimatedTokens: 2000 },
          { id: 'task-2', description: 'Implement API routes', dependencies: [], estimatedTokens: 3000 },
          { id: 'task-3', description: 'Write tests', dependencies: ['task-1', 'task-2'], estimatedTokens: 1500 },
        ],
      }),
    ]);

    const decomposer = new TaskDecomposer(provider);
    const result = await decomposer.decompose('Build a REST API with auth');

    expect(result.strategy).toBe('parallel');
    expect(result.subTasks).toHaveLength(3);
    expect(result.subTasks[2].dependencies).toContain('task-1');
  });

  it('falls back to single task on parse error', async () => {
    const provider = mockProvider(['not valid json']);
    const decomposer = new TaskDecomposer(provider);
    const result = await decomposer.decompose('Simple task');

    expect(result.subTasks).toHaveLength(1);
    expect(result.strategy).toBe('sequential');
  });
});

describe('SubAgentSpawner', () => {
  it('executes independent tasks in parallel', async () => {
    const spawner = new SubAgentSpawner({ maxConcurrency: 2, taskTimeoutMs: 5000 });

    const results = await spawner.executeAll([
      {
        id: 'task-1',
        description: 'Task A',
        dependencies: [],
        context: '',
        provider: mockProvider(['Result A']),
        estimatedTokens: 100,
      },
      {
        id: 'task-2',
        description: 'Task B',
        dependencies: [],
        context: '',
        provider: mockProvider(['Result B']),
        estimatedTokens: 100,
      },
    ]);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'success')).toBe(true);
    expect(results.map((r) => r.output).sort()).toEqual(['Result A', 'Result B']);
  });

  it('respects dependencies', async () => {
    const executionOrder: string[] = [];
    const spawner = new SubAgentSpawner({ maxConcurrency: 2, taskTimeoutMs: 5000 });

    const makeProvider = (id: string, result: string): LLMProvider => ({
      async complete() {
        executionOrder.push(id);
        return { content: result, usage: { inputTokens: 10, outputTokens: 20 } };
      },
    });

    await spawner.executeAll([
      {
        id: 'task-1',
        description: 'First',
        dependencies: [],
        context: '',
        provider: makeProvider('task-1', 'First result'),
        estimatedTokens: 100,
      },
      {
        id: 'task-2',
        description: 'Second',
        dependencies: ['task-1'],
        context: '',
        provider: makeProvider('task-2', 'Second result'),
        estimatedTokens: 100,
      },
    ]);

    expect(executionOrder.indexOf('task-1')).toBeLessThan(executionOrder.indexOf('task-2'));
  });

  it('handles timeout', async () => {
    const slowProvider: LLMProvider = {
      async complete() {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return { content: 'never', usage: { inputTokens: 0, outputTokens: 0 } };
      },
    };

    const spawner = new SubAgentSpawner({ taskTimeoutMs: 50 });
    const results = await spawner.executeAll([
      {
        id: 'task-1',
        description: 'Slow task',
        dependencies: [],
        context: '',
        provider: slowProvider,
        estimatedTokens: 100,
      },
    ]);

    expect(results[0].status).toBe('timeout');
  });
});

describe('ResultAggregator', () => {
  it('returns single result without merging', async () => {
    const provider = mockProvider([]);
    const aggregator = new ResultAggregator(provider);

    const result = await aggregator.aggregate([
      { subTaskId: 'task-1', status: 'success', output: 'Only result', tokensUsed: 100, durationMs: 50 },
    ]);

    expect(result.output).toBe('Only result');
    expect(result.resolved).toBe(true);
    expect(result.conflicts).toHaveLength(0);
  });

  it('merges multiple results', async () => {
    const provider = mockProvider([
      JSON.stringify({
        mergedOutput: 'Combined result from both tasks',
        conflicts: [],
        resolved: true,
      }),
    ]);

    const aggregator = new ResultAggregator(provider);
    const result = await aggregator.aggregate([
      { subTaskId: 'task-1', status: 'success', output: 'Part A', tokensUsed: 100, durationMs: 50 },
      { subTaskId: 'task-2', status: 'success', output: 'Part B', tokensUsed: 100, durationMs: 50 },
    ]);

    expect(result.output).toBe('Combined result from both tasks');
    expect(result.totalTokens).toBe(200);
  });

  it('falls back to concatenation on merge failure', async () => {
    const provider = mockProvider(['invalid json']);
    const aggregator = new ResultAggregator(provider);

    const result = await aggregator.aggregate([
      { subTaskId: 'task-1', status: 'success', output: 'Part A', tokensUsed: 100, durationMs: 50 },
      { subTaskId: 'task-2', status: 'success', output: 'Part B', tokensUsed: 100, durationMs: 50 },
    ]);

    expect(result.output).toContain('Part A');
    expect(result.output).toContain('Part B');
    expect(result.resolved).toBe(false);
  });
});

describe('CoordinatorEngine', () => {
  it('executes end-to-end', async () => {
    const callLog: string[] = [];
    const provider: LLMProvider = {
      async complete(messages) {
        const content = messages.map((m) => m.content).join('\n');
        callLog.push(content);

        // Decomposer call — the planner prompt contains "task_decomposition".
        if (content.toLowerCase().includes('task_decomposition') || content.toLowerCase().includes('strategic decomposition')) {
          return {
            content: JSON.stringify({
              strategy: 'parallel',
              rationale: 'Two independent tasks',
              subTasks: [
                { id: 'task-1', description: 'Build module A', dependencies: [], estimatedTokens: 1000 },
                { id: 'task-2', description: 'Build module B', dependencies: [], estimatedTokens: 1000 },
              ],
            }),
            usage: { inputTokens: 100, outputTokens: 200 },
          };
        }

        // Aggregator call
        if (content.toLowerCase().includes('synthesis engine')) {
          return {
            content: JSON.stringify({
              mergedOutput: 'Modules A and B complete',
              conflicts: [],
              resolved: true,
            }),
            usage: { inputTokens: 100, outputTokens: 200 },
          };
        }

        // Sub-agent calls
        return { content: 'Sub-task complete', usage: { inputTokens: 50, outputTokens: 100 } };
      },
    };

    const eventStream = new EventStream();
    const coordinator = new CoordinatorEngine({ provider, eventStream });

    const result = await coordinator.execute('Build two independent modules');

    expect(result.output).toBe('Modules A and B complete');
    expect(result.subTaskResults).toHaveLength(2);
    expect(result.resolved).toBe(true);
  });
});
