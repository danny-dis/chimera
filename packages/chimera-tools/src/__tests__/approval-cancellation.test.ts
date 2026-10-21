import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../tool-registry.js';
import { ToolExecutor, setAutoApprove } from '../tool-executor.js';
import { EventStream } from '@chimera/core';
const prompt = vi.hoisted(() => ({ question: vi.fn(), close: vi.fn(), once: vi.fn(), removeListener: vi.fn() }));
vi.mock('node:readline', () => ({ createInterface: () => prompt }));
const tty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
afterEach(() => {
  if (tty) Object.defineProperty(process.stdin, 'isTTY', tty); else delete (process.stdin as any).isTTY;
  vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); setAutoApprove(false);
});
it('cancels an interactive approval without user input or tool dispatch', async () => {
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  vi.stubEnv('NONINTERACTIVE', '0'); vi.stubEnv('CHIMERA_AUTOAPPROVE', '0'); setAutoApprove(false);
  const registry = new ToolRegistry(), execute = vi.fn(async () => ({}));
  registry.register({ name: 'sample', description: 'sample', parameters: z.object({}), returns: z.object({}), category: 'search', permissionLevel: 'read', execute });
  const executor = new ToolExecutor(registry, () => 'ask'), controller = new AbortController();
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  let settled = false;
  const pending = executor.execute('sample', {}, { workspaceRoot: process.cwd(), sessionId: 'approval', eventStream: new EventStream(), costTracker: {} as any, permissionCheck: () => 'ask', signal: controller.signal })
    .then(result => { settled = true; return result; });
  try {
    await vi.waitFor(() => expect(prompt.question).toHaveBeenCalledOnce());
    controller.abort('cancelled');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(settled).toBe(true);
    expect(prompt.close).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    const result = await pending;
    expect(result.success).toBe(false); expect(result.error).toMatch(/abort|cancel/i);
    expect(execute).not.toHaveBeenCalled();
  } finally {
    if (!settled) prompt.question.mock.calls[0][1]('n');
    await pending;
  }
});
