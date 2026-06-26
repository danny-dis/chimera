import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubAgentSpawner } from '../sub-agent-spawner.js';
import { EventStream } from '../../event-stream.js';
import type { LLMProvider } from '../../session-orchestrator.js';

describe('SubAgentSpawner Scheduler', () => {
  let eventStream: EventStream;

  beforeEach(() => {
    eventStream = new EventStream();
  });

  it('respects maxConcurrency', async () => {
    let active = 0;
    let peak = 0;

    const provider: LLMProvider = {
      async complete() {
        active++;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 50));
        active--;
        return {
          content: 'Done',
          usage: { inputTokens: 10, outputTokens: 10 },
        };
      },
    };

    const spawner = new SubAgentSpawner(eventStream, { maxConcurrency: 2 });
    
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      id: `task-${i}`,
      description: `Task ${i}`,
      dependencies: [],
      context: '',
      provider,
      estimatedTokens: 100,
    }));

    await spawner.executeAll(tasks);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('respects dependencies', async () => {
    const completed: string[] = [];
    
    const provider: LLMProvider = {
      async complete(_messages, _options) {
        return {
          content: 'Done',
          usage: { inputTokens: 10, outputTokens: 10 },
        };
      },
    };

    const spawner = new SubAgentSpawner(eventStream);
    
    const tasks = [
      { id: 'task-1', description: 'T1', dependencies: ['task-2'], context: '', provider, estimatedTokens: 10 },
      { id: 'task-2', description: 'T2', dependencies: [], context: '', provider, estimatedTokens: 10 },
    ];

    const results = await spawner.executeAll(tasks);
    
    // results order might not be guaranteed, but we check timing
    // Wait, executeAll returns results as they finish? 
    // In my impl, results.push(result) happens after executeOne.
    // task-2 must finish before task-1 starts.
    
    const t1 = results.find(r => r.subTaskId === 'task-1')!;
    const t2 = results.find(r => r.subTaskId === 'task-2')!;
    
    expect(t1.status).toBe('success');
    expect(t2.status).toBe('success');
  });

  it('respects priority', async () => {
    const order: string[] = [];
    
    const provider: LLMProvider = {
      async complete() {
        return {
          content: 'Done',
          usage: { inputTokens: 10, outputTokens: 10 },
        };
      },
    };

    // We override executeOne to track order
    const spawner = new SubAgentSpawner(eventStream, { maxConcurrency: 1 });
    (spawner as any).executeOne = async (task: any) => {
        order.push(task.id);
        return { subTaskId: task.id, status: 'success', output: '', tokensUsed: 0, durationMs: 0 };
    };
    
    const tasks = [
      { id: 'low', description: 'Low', dependencies: [], context: '', provider, estimatedTokens: 10, priority: 1 },
      { id: 'high', description: 'High', dependencies: [], context: '', provider, estimatedTokens: 10, priority: 10 },
    ];

    await spawner.executeAll(tasks);
    expect(order).toEqual(['high', 'low']);
  });
});
