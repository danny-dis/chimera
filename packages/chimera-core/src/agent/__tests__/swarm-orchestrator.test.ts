import { describe, it, expect, vi } from 'vitest';
import { SwarmOrchestrator } from '../swarm-orchestrator.js';
import type { LLMProvider } from '../../session-orchestrator.js';

function mockProvider(response: string, delayMs = 0): LLMProvider {
  return {
    async complete() {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return { content: response, usage: { inputTokens: 50, outputTokens: 100 } };
    },
  } as unknown as LLMProvider;
}

function failingProvider(error = 'provider error'): LLMProvider {
  return {
    async complete() { throw new Error(error); },
  } as unknown as LLMProvider;
}

describe('SwarmOrchestrator', () => {
  it('executes tasks across providers', async () => {
    const swarm = new SwarmOrchestrator({ config: { maxConcurrency: 3, staggerDelayMs: 0 } });
    swarm.registerProviders([
      { id: 'p1', provider: mockProvider('result-1') },
      { id: 'p2', provider: mockProvider('result-2') },
    ]);

    const result = await swarm.execute([
      { id: 't1', description: 'Task 1', priority: 1 },
      { id: 't2', description: 'Task 2', priority: 1 },
      { id: 't3', description: 'Task 3', priority: 1 },
    ]);

    expect(result.completed).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.totalAgents).toBe(3);
  });

  it('respects maxAgents cap', async () => {
    const swarm = new SwarmOrchestrator({ config: { maxAgents: 2, staggerDelayMs: 0 } });
    swarm.registerProviders([{ id: 'p1', provider: mockProvider('ok') }]);

    const tasks = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, description: `Task ${i}`, priority: 1 }));
    const result = await swarm.execute(tasks);

    expect(result.totalAgents).toBe(2);
  });

  it('handles provider failures gracefully', async () => {
    const swarm = new SwarmOrchestrator({ config: { maxConcurrency: 2, staggerDelayMs: 0 } });
    swarm.registerProviders([
      { id: 'good', provider: mockProvider('ok') },
      { id: 'bad', provider: failingProvider() },
    ]);

    const result = await swarm.execute([
      { id: 't1', description: 'Task 1', priority: 1 },
      { id: 't2', description: 'Task 2', priority: 1 },
    ]);

    expect(result.completed + result.failed).toBe(2);
  });

  it('reports live stats', async () => {
    const swarm = new SwarmOrchestrator({ config: { maxConcurrency: 1, staggerDelayMs: 0 } });
    swarm.registerProviders([{ id: 'p1', provider: mockProvider('ok', 50) }]);

    const execPromise = swarm.execute([
      { id: 't1', description: 'Task 1', priority: 1 },
      { id: 't2', description: 'Task 2', priority: 1 },
    ]);

    await new Promise((r) => setTimeout(r, 10));
    const stats = swarm.getStats();
    expect(stats.queued + stats.running).toBeGreaterThan(0);

    await execPromise;
    expect(swarm.getStats().completed).toBe(2);
  });

  it('tracks per-agent cost and tokens', async () => {
    const swarm = new SwarmOrchestrator({ config: { maxConcurrency: 2, staggerDelayMs: 0 } });
    swarm.registerProviders([{ id: 'p1', provider: mockProvider('ok') }]);

    await swarm.execute([{ id: 't1', description: 'Task 1', priority: 1 }]);

    const agents = swarm.getAllAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].tokensUsed).toBe(150);
    expect(agents[0].costUsd).toBeGreaterThan(0);
  });

  it('throws when no providers registered', async () => {
    const swarm = new SwarmOrchestrator();
    await expect(swarm.execute([{ id: 't1', description: 'Task', priority: 1 }]))
      .rejects.toThrow('No providers registered');
  });

  it('emits swarm events', async () => {
    const swarm = new SwarmOrchestrator({ config: { maxConcurrency: 2, staggerDelayMs: 0 } });
    swarm.registerProviders([{ id: 'p1', provider: mockProvider('ok') }]);

    const events: string[] = [];
    swarm.on('swarm_started', () => events.push('started'));
    swarm.on('swarm_completed', () => events.push('completed'));
    swarm.on('agent_started', () => events.push('agent_started'));
    swarm.on('agent_completed', () => events.push('agent_completed'));

    await swarm.execute([
      { id: 't1', description: 'Task 1', priority: 1 },
      { id: 't2', description: 'Task 2', priority: 1 },
    ]);

    expect(events).toContain('started');
    expect(events).toContain('completed');
    expect(events.filter((e) => e === 'agent_started')).toHaveLength(2);
    expect(events.filter((e) => e === 'agent_completed')).toHaveLength(2);
  });

  it('distributes work across multiple providers', async () => {
    const callCounts = { p1: 0, p2: 0, p3: 0 };
    const providers = ['p1', 'p2', 'p3'].map((id) => ({
      id,
      provider: {
        async complete() {
          callCounts[id as keyof typeof callCounts]++;
          return { content: id, usage: { inputTokens: 10, outputTokens: 10 } };
        },
      } as unknown as LLMProvider,
      weight: 1,
    }));

    const swarm = new SwarmOrchestrator({ config: { maxConcurrency: 6, staggerDelayMs: 0 } });
    swarm.registerProviders(providers);

    await swarm.execute(Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, description: `Task ${i}`, priority: 1 })));

    // All 3 providers should have received work
    expect(callCounts.p1 + callCounts.p2 + callCounts.p3).toBe(12);
  });
});
