import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { EventStream } from '@chimera/core';
import { ToolExecutor, setAutoApprove } from '../tool-executor.js';
import { ToolRegistry } from '../tool-registry.js';
import { HookExecutor } from '../hooks/executor.js';
import type { ToolContext } from '../tool-schema.js';

const original = () => ({ value: 'authorized', nested: { value: 'authorized' } });
const mutate = (args: Record<string, any>) => {
  args.value = 'changed';
  args.nested.value = 'changed';
};
function fixture() {
  const registry = new ToolRegistry();
  const run = vi.fn().mockResolvedValue({ ok: true });
  const preview = vi.fn().mockResolvedValue(null);
  registry.register({
    name: 'probe', description: 'Approval snapshot probe', category: 'filesystem', permissionLevel: 'write',
    parameters: z.object({ value: z.string(), nested: z.any(), extra: z.any().optional() }),
    returns: z.object({ ok: z.boolean() }), execute: run, previewDiff: preview,
  });
  const eventStream = new EventStream();
  const context: ToolContext = { workspaceRoot: process.cwd(), sessionId: 'approval-snapshot', eventStream };
  return { registry, run, preview, eventStream, context };
}
afterEach(() => { setAutoApprove(false); vi.restoreAllMocks(); });

describe('approval snapshots', () => {
  it.each(['preview', 'subscriber', 'both'])('isolates scalar and nested mutations by %s', async (source) => {
    setAutoApprove(true);
    const f = fixture();
    if (source !== 'subscriber') f.preview.mockImplementation(async args => { mutate(args); return null; });
    let requested: unknown;
    f.eventStream.subscribe('tool_call_requested', event => {
      const args = (event as any).call.args;
      requested = structuredClone(args);
      if (source !== 'preview') mutate(args);
    });
    const executor = new ToolExecutor(f.registry, () => 'ask');
    const result = await executor.execute('probe', original(), f.context);
    expect(result.success).toBe(true);
    expect(f.run.mock.calls[0][0]).toEqual(original());
    expect(requested).toEqual(original());
  });

  it('reauthorizes in-place custom hook mutations', async () => {
    const f = fixture();
    const hooks = new HookExecutor();
    vi.spyOn(hooks, 'loadFromWorkspace').mockResolvedValue();
    vi.spyOn(hooks, 'executeHooks').mockImplementation(async (_event, context) => {
      mutate(context.params!);
      return [];
    });
    const policy = vi.fn((_tool, args) => args.nested.value === 'authorized' ? 'allow' as const : 'deny' as const);
    const result = await new ToolExecutor(f.registry, policy, undefined, hooks).execute('probe', original(), f.context);
    expect(policy).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(false);
    expect(f.run).not.toHaveBeenCalled();
  });

  it.each(['input', 'hook'])('denies uncloneable %s params without exposing nested aliases', async source => {
    const f = fixture();
    const args = original();
    const payload = { ...args, extra: () => {} };
    const hooks = new HookExecutor();
    vi.spyOn(hooks, 'loadFromWorkspace').mockResolvedValue();
    vi.spyOn(hooks, 'executeHooks').mockResolvedValue([{ modifiedParams: payload }]);
    const policy = vi.fn((_tool, params) => { params.nested.value = 'leaked'; return 'allow' as const; });
    const result = await new ToolExecutor(f.registry, policy, undefined, source === 'hook' ? hooks : undefined)
      .execute('probe', source === 'input' ? payload : original(), f.context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Permission denied');
    expect(args.nested.value).toBe('authorized');
    expect(f.run).not.toHaveBeenCalled();
    expect(f.preview).not.toHaveBeenCalled();
  });
});
