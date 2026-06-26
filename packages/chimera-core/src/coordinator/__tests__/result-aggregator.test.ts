import { describe, it, expect, vi } from 'vitest';
import { ResultAggregator } from '../result-aggregator.js';
import type { SubTaskResult } from '../types.js';

function makeResult(id: string, output: string, tokens = 100): SubTaskResult {
  return { subTaskId: id, status: 'success', output, tokensUsed: tokens, durationMs: 50 };
}

function mockProvider(content: string) {
  return {
    complete: vi.fn().mockResolvedValue({
      content,
      usage: { totalTokens: 50 },
    }),
  };
}

describe('ResultAggregator', () => {
  it('returns single result directly', async () => {
    const agg = new ResultAggregator(mockProvider(''));
    const result = await agg.aggregate([makeResult('t1', 'hello')]);
    expect(result.output).toBe('hello');
    expect(result.resolved).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.subTaskResults).toHaveLength(1);
  });

  it('sums tokens across all sub-task results', async () => {
    const agg = new ResultAggregator(mockProvider(''));
    const results = await agg.aggregate([
      makeResult('t1', 'first', 200),
      makeResult('t2', 'second', 300),
    ]);
    expect(results.totalTokens).toBe(500);
    expect(results.subTaskResults.length).toBe(2);
  });

  it('merges multiple results via provider', async () => {
    const provider = mockProvider(JSON.stringify({
      mergedOutput: 'combined result',
      conflicts: [],
      resolved: true,
    }));

    const agg = new ResultAggregator(provider);
    const results = await agg.aggregate([
      makeResult('t1', 'implement a cache layer'),
      makeResult('t2', 'review the cache for security issues'),
    ]);

    expect(results.output).toBe('combined result');
    expect(results.resolved).toBe(true);
    expect(results.conflicts).toEqual([]);
    expect(provider.complete).toHaveBeenCalled();
  });

  it('returns parsed conflicts from provider', async () => {
    const provider = mockProvider(JSON.stringify({
      mergedOutput: 'merged',
      conflicts: [
        {
          subTaskIds: ['t1', 't2'],
          type: 'contradiction',
          description: 'differing approaches',
          resolution: 'chose t1',
        },
      ],
      resolved: true,
    }));

    const agg = new ResultAggregator(provider);
    const results = await agg.aggregate([
      makeResult('t1', 'use approach A'),
      makeResult('t2', 'use approach B'),
    ]);

    expect(results.conflicts).toHaveLength(1);
    expect(results.conflicts[0].type).toBe('contradiction');
    expect(results.conflicts[0].resolution).toBe('chose t1');
    expect(results.resolved).toBe(true);
  });

  it('falls back to concatenation on parse error', async () => {
    const provider = mockProvider('not valid json {{{');
    const agg = new ResultAggregator(provider);

    const results = await agg.aggregate([
      makeResult('t1', 'implement feature A'),
      makeResult('t2', 'review feature A'),
    ]);

    expect(results.output).toContain('implement feature A');
    expect(results.output).toContain('review feature A');
    expect(results.resolved).toBe(false);
    expect(results.conflicts).toEqual([]);
    expect(provider.complete).toHaveBeenCalled();
  });

  it('handles mixed success and failure', async () => {
    const agg = new ResultAggregator(mockProvider(''));
    const results = await agg.aggregate([
      makeResult('t1', 'implement feature A'),
      { subTaskId: 't2', status: 'error', output: '', tokensUsed: 0, durationMs: 50, error: 'timeout' },
    ]);

    expect(results.output).toBe('implement feature A');
    expect(results.resolved).toBe(true);
  });

  it('returns empty output when all results fail', async () => {
    const agg = new ResultAggregator(mockProvider(''));
    const results = await agg.aggregate([
      { subTaskId: 't1', status: 'error', output: '', tokensUsed: 0, durationMs: 50, error: 'timeout' },
      { subTaskId: 't2', status: 'error', output: '', tokensUsed: 0, durationMs: 50, error: 'timeout' },
    ]);

    expect(results.output).toBe('');
    expect(results.resolved).toBe(true);
    expect(results.subTaskResults).toHaveLength(2);
  });

  it('totals tokens including failed results', async () => {
    const agg = new ResultAggregator(mockProvider(''));
    const results = await agg.aggregate([
      makeResult('t1', 'ok', 150),
      { subTaskId: 't2', status: 'error', output: '', tokensUsed: 50, durationMs: 50, error: 'fail' },
    ]);

    expect(results.totalTokens).toBe(200);
  });
});
