import { expect, it, vi } from 'vitest';
import { EventStream } from '../../event-stream.js';
import { SubAgentSpawner } from '../sub-agent-spawner.js';
it('cancels staggering and queued work without invoking providers', async () => {
  vi.useFakeTimers();
  const ac = new AbortController(); const complete = vi.fn(async () => ({ content: 'must not run' }));
  try {
    const spawner = new SubAgentSpawner(new EventStream(), { maxConcurrency: 1, staggerDelayMs: 60000 }, undefined, { maxRetries: 0 }, { signal: ac.signal });
    const running = spawner.executeAll(['one', 'two'].map(id => ({ id, description: id, dependencies: [], context: '', estimatedTokens: 1, provider: { complete } })));
    await vi.advanceTimersByTimeAsync(1); ac.abort(new Error('cancelled'));
    await vi.advanceTimersByTimeAsync(1);
    const settled = vi.fn(); void running.then(settled);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledOnce();
    expect((await running).every(result => result.status === 'error')).toBe(true);
    expect(complete).not.toHaveBeenCalled();
  } finally { vi.clearAllTimers(); vi.useRealTimers(); }
});
