import { expect, it, vi } from 'vitest';
import { SwarmOrchestrator } from '../swarm-orchestrator.js';
it('does not leave recurring timers behind after a swarm finishes', async () => {
  vi.useFakeTimers();
  try {
    const swarm = new SwarmOrchestrator({ config: { staggerDelayMs: 0 } });
    swarm.registerProviders([{ id: 'local', provider: { complete: async () => ({ content: 'PONG', usage: { inputTokens: 1, outputTokens: 1 } }) } }]);
    const result = await swarm.execute([{ id: 'one', description: 'Reply PONG', priority: 1 }]);
    expect(result.output).toBe('PONG');
    expect(result.completed).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.clearAllTimers(); vi.useRealTimers(); }
});
