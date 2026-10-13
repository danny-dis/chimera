import { describe, expect, it, vi } from 'vitest';
import { ResultAggregator } from '../result-aggregator.js';
import type { SubTaskResult } from '../types.js';
const result = (id: string, status: SubTaskResult['status']): SubTaskResult => ({ subTaskId: id, status, output: status === 'success' ? id : '', error: status === 'error' ? 'child failed' : undefined, tokensUsed: 1, durationMs: 1 });
describe('child failure is not resolved', () => {
  it('rejects empty, all-failed and mixed child sets', async () => {
    const aggregator = new ResultAggregator({ complete: vi.fn() });
    for (const results of [[], [result('a', 'error')], [result('a', 'success'), result('b', 'error')]]) {
      expect((await aggregator.aggregate(results)).resolved).toBe(false);
    }
  });
  it('cannot let synthesis override a failed child', async () => {
    const complete = vi.fn().mockResolvedValue({ content: JSON.stringify({ mergedOutput: 'done', resolved: true }) });
    const merged = await new ResultAggregator({ complete }).aggregate([result('a', 'success'), result('b', 'success'), result('c', 'error')]);
    expect(merged.resolved).toBe(false);
  });
  it('requires an explicit boolean synthesis verdict', async () => {
    const complete = vi.fn().mockResolvedValue({ content: JSON.stringify({ mergedOutput: 'done' }) });
    expect((await new ResultAggregator({ complete }).aggregate([result('a', 'success'), result('b', 'success')])).resolved).toBe(false);
  });
});
