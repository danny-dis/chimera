import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubAgentSpawner } from '../sub-agent-spawner.js';
import { EventStream } from '../../event-stream.js';
import type { SubTask } from '../types.js';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
const task = (complete: any): SubTask => ({ id: 'one', description: 'Inspect',
  dependencies: [], context: '', provider: { complete }, estimatedTokens: 1 });

describe('bounded child execution', () => {
  it.each([0, -1, NaN, Infinity])('rejects invalid task timeout %s', taskTimeoutMs => {
    expect(() => new SubAgentSpawner({ taskTimeoutMs })).toThrow(/timeout/i);
  });

  it('cancels while waiting to retry a rate-limited provider', async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const events = new EventStream();
    const append = events.append.bind(events);
    vi.spyOn(events, 'append').mockImplementation(event => {
      append(event);
      if (event.type === 'provider_rate_limited') ac.abort(new Error('user cancelled'));
    });
    const complete = vi.fn(async () => { throw new Error('429 rate limit'); });
    const spawner = new SubAgentSpawner(events, {}, undefined,
      { baseBackoffMs: 10_000, maxRetries: 2 }, { signal: ac.signal });
    const bounded = Promise.race([spawner.executeAll([task(complete)]),
      new Promise(resolve => setTimeout(() => resolve('still waiting'), 100))]);
    const check = expect(bounded).resolves.toEqual([
      expect.objectContaining({ status: 'error', error: expect.stringMatching(/cancelled/i) }),
    ]);
    await Promise.all([check, vi.advanceTimersByTimeAsync(100)]);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
