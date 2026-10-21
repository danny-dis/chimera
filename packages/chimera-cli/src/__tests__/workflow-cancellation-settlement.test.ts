import { expect, it, vi } from 'vitest';
import { CostTracker, EventStream } from '@chimera/core';
import { runWorkflowInContext } from '../workflow-runtime.js';

const writer = { getModel: () => ({ provider: 'openai-compatible' }) } as any;
function options(signal: AbortSignal) {
  const eventStream = new EventStream();
  return { workspaceRoot: process.cwd(), sessionId: 'settlement', mode: 'code' as const, signal, eventStream, costTracker: new CostTracker(eventStream) };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

it.each(['tool', 'coding'] as const)('retains cancelled %s execution until it settles', async kind => {
  const controller = new AbortController();
  let finish!: () => void;
  let observedSignal: AbortSignal | undefined;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const execute = vi.fn(async (...args: any[]) => {
    observedSignal = kind === 'tool' ? args[2].signal : args[0].signal;
    await pending;
    return kind === 'tool' ? { success: true, data: {}, duration: 0 } : { status: 'done', output: 'late output' };
  });
  const step = kind === 'tool' ? { id: 'owned', kind: 'tool' as const, config: { name: 'write_file', args: {} } }
    : { id: 'owned', kind: 'llm' as const, config: { role: 'writer', toolLoop: true, prompt: 'Create output.js' } };
  let settled = false;
  const run = runWorkflowInContext({ name: 'owned', steps: [step] }, {
    writer, toolExecutor: { execute } as any, orchestrator: { execute } as any,
  }, options(controller.signal));
  const outcome = run.then(value => ({ value }), error => ({ error })).finally(() => { settled = true; });
  try {
    expect(execute).toHaveBeenCalledOnce();
    controller.abort();
    await tick();
    expect(observedSignal?.aborted).toBe(true);
    expect(settled).toBe(false);
  } finally { finish(); }
  expect(await outcome).toHaveProperty('error');
});

it('drains every parallel tool branch before releasing cancellation ownership', async () => {
  const controller = new AbortController();
  const finish: Array<() => void> = [];
  const execute = vi.fn(() => new Promise(resolve => { finish.push(() => resolve({ success: true, duration: 0 })); }));
  const tool = (id: string) => ({ id, kind: 'tool' as const, config: { name: 'write_file', args: {} } });
  const run = runWorkflowInContext({ name: 'parallel', steps: [{ id: 'branches', kind: 'parallel', config: { branches: [tool('a'), tool('b')] } }] },
    { writer, toolExecutor: { execute } as any }, options(controller.signal));
  let settled = false;
  const outcome = run.catch(error => error).finally(() => { settled = true; });
  try {
    expect(execute).toHaveBeenCalledTimes(2);
    controller.abort();
    finish[0]();
    await tick();
    expect(settled).toBe(false);
  } finally { finish.forEach(resolve => resolve()); }
  expect(await outcome).toBeInstanceOf(Error);
});
