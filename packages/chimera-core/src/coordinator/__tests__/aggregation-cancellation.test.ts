import { afterEach, expect, it, vi } from 'vitest';
import { RateLimitError } from '@chimera/providers';
import { ResultAggregator } from '../result-aggregator.js';
const children = ['a', 'b'].map(subTaskId => ({ subTaskId, status: 'success' as const, output: subTaskId, tokensUsed: 1, durationMs: 1 }));
afterEach(() => vi.useRealTimers());
it('returns child evidence promptly when synthesis ignores cancellation', async () => {
  const controller = new AbortController();
  let release!: (value: any) => void;
  const complete = vi.fn(() => new Promise<any>(resolve => { release = resolve; }));
  const run = new ResultAggregator({ complete }).aggregate(children, controller.signal);
  let result: any;
  const checked = run.then(value => { result = value; });
  try {
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    controller.abort(new Error('cancelled'));
    await vi.waitFor(() => expect(result).toMatchObject({ resolved: false, subTaskResults: children }), { timeout: 200 });
    expect(complete).toHaveBeenCalledOnce();
  } finally { release({ content: '{"resolved":true}' }); await checked; }
});
it('does not invoke synthesis retry after abort during backoff', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const complete = vi.fn().mockRejectedValue(new RateLimitError('limited'));
  const run = new ResultAggregator({ complete }).aggregate(children, controller.signal);
  await vi.advanceTimersByTimeAsync(0);
  expect(complete).toHaveBeenCalledOnce();
  controller.abort(new Error('cancelled'));
  await vi.advanceTimersByTimeAsync(60000);
  expect((await run).resolved).toBe(false);
  expect(complete).toHaveBeenCalledOnce();
});
