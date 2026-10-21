import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SimpleModelRegistry } from '@chimera/providers';
import { EventStream } from '../../../event-stream.js';
import { DeliberationEngine } from '../engine.js';

it.each([
  { phase: 'before-panel', expected: [] },
  { phase: 'tool', expected: ['panel'] },
  { phase: 'follow-up', expected: ['panel', 'panel'] },
  { phase: 'rebuttal', expected: ['panel', 'panel'] },
  { phase: 'judge', expected: ['panel', 'judge'] },
])('does not continue Fusion after cancellation at $phase', async ({ phase, expected }) => {
  const controller = new AbortController();
  const calls: Array<{ model: string; signal: unknown }> = [];
  let panelCalls = 0;
  if (phase === 'before-panel') controller.abort();
  const engine = new DeliberationEngine({
    eventStream: new EventStream(), registry: new SimpleModelRegistry(), mode: 'plan',
    workspaceRoot: process.cwd(), signal: controller.signal,
    toolRegistry: { has: name => name === 'read_file', getAll: () => [{ name: 'read_file',
      description: 'Read source', permissionLevel: 'read', parameters: z.object({ path: z.string() }) }] } as any,
    toolExecutor: { execute: async () => {
      if (phase === 'tool') controller.abort();
      return { success: true, data: { content: 'source' }, duration: 0 };
    } },
    providerFactory: model => ({ complete: async (_messages, options) => {
      calls.push({ model, signal: options?.signal });
      if (model === 'panel') {
        panelCalls++;
        if ((phase === 'follow-up' || phase === 'rebuttal') && panelCalls === 2) controller.abort();
        if (['tool', 'follow-up'].includes(phase) && panelCalls === 1) return { content: '',
          toolCalls: [{ id: 'read-source', name: 'read_file', arguments: { path: 'calc.js' } }] };
        return { content: 'Bounded analysis.' };
      }
      if (phase === 'judge') controller.abort();
      return { content: JSON.stringify({ finalResponse: 'Must not accept a cancelled result.', confidence: 0.9 }) };
    } }),
  });
  await expect(engine.run({ mode: 'fusion', task: 'Plan a bounded refactor of calc.js.',
    analysisModels: ['panel'], judgeModel: 'judge', judgeFailover: ['backup'],
    adversarialRound: phase === 'rebuttal', maxToolRounds: 1 })).rejects.toMatchObject({ name: 'AbortError' });
  expect(calls.map(call => call.model)).toEqual(expected);
  expect(calls.every(call => call.signal === controller.signal)).toBe(true);
});

it('settles abort during panel retry backoff without another provider call', async () => {
  vi.useFakeTimers();
  try {
    const controller = new AbortController();
    const calls: string[] = [];
    const engine = new DeliberationEngine({ eventStream: new EventStream(),
      registry: new SimpleModelRegistry(), mode: 'plan', signal: controller.signal,
      providerFactory: model => ({ complete: async () => {
        calls.push(model);
        throw new Error('provider returned empty content');
      } }),
    });
    let settled = false;
    const outcome = engine.run({ mode: 'fusion', task: 'Plan a bounded calculator refactor.',
      analysisModels: ['panel'], judgeModel: 'judge' }).then(
      () => { settled = true; return null; },
      error => { settled = true; return error; },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['panel']);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    await expect(outcome).resolves.toMatchObject({ name: 'AbortError' });
    await vi.runAllTimersAsync();
    expect(calls).toEqual(['panel']);
  } finally { vi.useRealTimers(); }
});
