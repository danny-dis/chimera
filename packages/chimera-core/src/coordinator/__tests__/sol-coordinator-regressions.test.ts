import { afterEach, expect, it, vi } from 'vitest';
import { setImmediate } from 'node:timers/promises';
import { CoordinatorEngine } from '../coordinator-engine.js';
import { DeliberationEngine } from '../deliberation/engine.js';
import { EventStream } from '../../event-stream.js';
import type { Mode } from '../../types/agent.js';

const usage = { inputTokens: 1, outputTokens: 1 };
const merge = { complete: async () => ({ content: JSON.stringify({ mergedOutput: 'merged', resolved: true }), usage }) };
const executor = { execute: vi.fn(async () => ({ success: true, duration: 0 })) };
afterEach(() => vi.restoreAllMocks());

it.each(['code', 'debug', 'oal', 'auto', undefined] as const)('SOL03 serializes write-capable shared-root tasks in %s despite configured concurrency', async mode => {
  let active = 0, peak = 0;
  const child = { complete: async () => {
    active++; peak = Math.max(peak, active);
    await setImmediate(); active--;
    return { content: 'child result', usage };
  } };
  const coordinator = new CoordinatorEngine({ provider: merge, eventStream: new EventStream(),
    config: { maxConcurrency: 4 }, tools: [{ name: 'write_file', description: '', parameters: {} }],
    toolDeps: { toolExecutor: executor, workspaceRoot: process.cwd(), mode: mode as Mode } });
  const tasks = ['one', 'two', 'three'].map(id => ({ id, description: id, context: '', dependencies: [], estimatedTokens: 1, provider: child }));
  const result = await coordinator.execute('implement shared modules', '', tasks);
  expect(result.resolved).toBe(true);
  expect(result.subTaskResults.every(r => r.status === 'success')).toBe(true);
  expect(peak).toBe(1);
});

it.each(['ask', 'plan', 'review'] as const)('SOL03 preserves configured concurrency for read-only %s', async mode => {
  let active = 0, peak = 0;
  const child = { complete: async () => {
    active++; peak = Math.max(peak, active);
    await setImmediate(); active--;
    return { content: 'analysis result', usage };
  } };
  const coordinator = new CoordinatorEngine({ provider: merge, eventStream: new EventStream(),
    config: { maxConcurrency: 2 }, tools: [{ name: 'read_file', description: '', parameters: {} }],
    toolDeps: { toolExecutor: executor, workspaceRoot: process.cwd(), mode } });
  const tasks = ['one', 'two', 'three'].map(id => ({ id, description: id, context: '', dependencies: [], estimatedTokens: 1, provider: child }));
  expect((await coordinator.execute('inspect modules', '', tasks)).resolved).toBe(true);
  expect(peak).toBe(2);
});

it('SOL04 coordinator composes incoming provider signal with parent', async () => {
  const parent = new AbortController(), child = new AbortController();
  let received: AbortSignal | undefined;
  const provider = { complete: vi.fn(async (_messages, options) => {
    received = options.signal;
    child.abort(new Error('child deadline'));
    return { content: 'late', usage };
  }) };
  const engine = new CoordinatorEngine({ provider, eventStream: new EventStream(), toolDeps: { signal: parent.signal } });
  await expect((engine as any).decomposer.provider.complete([], { signal: child.signal })).rejects.toThrow('child deadline');
  expect(parent.signal.aborted).toBe(false);
  expect(received?.aborted).toBe(true);
});

it('SOL04 hive forwards parent cancellation into its real coordinator', async () => {
  const parent = new AbortController();
  const complete = vi.fn()
    .mockResolvedValueOnce({ content: JSON.stringify({ subTasks: [{ id: 'one', description: 'inspect module', dependencies: [] }] }), usage })
    .mockImplementationOnce(async () => {
      parent.abort(new Error('hive cancelled'));
      return { content: 'late child result', usage };
    });
  const engine = new DeliberationEngine({ eventStream: new EventStream(), registry: {} as any,
    providerFactory: () => ({ complete }), signal: parent.signal });
  const result = await engine.run({ mode: 'hive', task: 'inspect module architecture', models: ['offline'] });
  expect(complete).toHaveBeenCalledTimes(2);
  expect(result.degraded).toBe(true);
  expect(result.output).not.toContain('late child result');
});
