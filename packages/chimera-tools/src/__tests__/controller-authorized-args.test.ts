import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PathRestrictionEngine } from '../permission/path-restrictions.js';
import { ToolExecutor, setAutoApprove } from '../tool-executor.js';
import { ToolRegistry } from '../tool-registry.js';
import type { ToolContext, PermissionDecision } from '../tool-schema.js';

function fixture(schema: ReturnType<typeof z.object>, policy: (args: Record<string, unknown>) => PermissionDecision) {
  const run = vi.fn().mockResolvedValue({ ok: true });
  const registry = new ToolRegistry();
  registry.register({ name: 'probe', description: 'Harmless argument-policy probe', category: 'filesystem', permissionLevel: 'write', parameters: schema, returns: z.object({ ok: z.boolean() }), execute: run });
  const append = vi.fn();
  const context: ToolContext = { workspaceRoot: process.cwd(), sessionId: 'coercion-policy', eventStream: { append } };
  const executor = new ToolExecutor(registry, (_tool, args) => policy(args));
  return { run, append, context, executor };
}

afterEach(() => { setAutoApprove(false); vi.unstubAllEnvs(); });

describe('exact authorized dispatch arguments', () => {
  it('fails closed when missing-path walk reaches an inaccessible workspace boundary', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-boundary-error-'));
    try {
      const restrictions = new PathRestrictionEngine(root);
      const realpath = fs.realpathSync;
      vi.spyOn(fs, 'realpathSync').mockImplementation(((value: fs.PathLike, options?: unknown) => {
        if (path.resolve(String(value)) === path.resolve(root)) throw Object.assign(new Error('boundary inaccessible'), { code: 'EACCES' });
        return realpath(value, options as never);
      }) as typeof fs.realpathSync);
      expect(restrictions.isPathAllowed('missing/leaf.txt')).toBe(false);
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not dispatch denied boolean after string-to-boolean coercion', async () => {
    const f = fixture(z.object({ overwrite: z.boolean().default(false) }), args => args.overwrite === true ? 'deny' : 'allow');
    const result = await f.executor.execute('probe', { overwrite: 'true' }, f.context);
    expect({ success: result.success, toolRuns: f.run.mock.calls.length }).toEqual({ success: false, toolRuns: 0 });
  });

  it('does not dispatch denied schema-default value after raw args allowed', async () => {
    const f = fixture(z.object({ overwrite: z.boolean().default(true) }), args => args.overwrite === true ? 'deny' : 'allow');
    const result = await f.executor.execute('probe', {}, f.context);
    expect({ success: result.success, toolRuns: f.run.mock.calls.length }).toEqual({ success: false, toolRuns: 0 });
  });

  it('still dispatches authorized coerced false value', async () => {
    const f = fixture(z.object({ overwrite: z.boolean().default(false) }), args => args.overwrite === true ? 'deny' : 'allow');
    const result = await f.executor.execute('probe', { overwrite: 'false' }, f.context);
    expect(result.success).toBe(true);
    expect(f.run.mock.calls[0]?.[0]).toEqual({ overwrite: false });
  });

  it('unchanged ask without hooks requests approval only once', async () => {
    vi.stubEnv('NONINTERACTIVE', '0');
    vi.stubEnv('CHIMERA_AUTOAPPROVE', '0');
    setAutoApprove(true);
    const f = fixture(z.object({ overwrite: z.boolean().default(false) }), () => 'ask');
    expect((await f.executor.execute('probe', { overwrite: false }, f.context)).success).toBe(true);
    expect(f.run).toHaveBeenCalledTimes(1);
    const requests = f.append.mock.calls.map(([e]) => e).filter(e => e.type === 'tool_call_requested' && e.policy === 'ask');
    expect(requests).toHaveLength(1);
  });

  it('does not dispatch retry when permission callback aborts the owned signal', async () => {
    const controller = new AbortController();
    const registry = new ToolRegistry();
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('File already exists and overwrite is false'))
      .mockResolvedValue({ ok: true });
    registry.register({ name: 'write_file', description: 'Harmless retry probe', category: 'filesystem', permissionLevel: 'write', parameters: z.object({ overwrite: z.boolean().default(false) }), returns: z.object({ ok: z.boolean() }), execute: run });
    const context: ToolContext = { workspaceRoot: process.cwd(), sessionId: 'retry-abort-policy', signal: controller.signal, eventStream: { append: vi.fn() } };
    const executor = new ToolExecutor(registry, (_tool, args) => {
      if (args.overwrite === true) controller.abort();
      return 'allow';
    });
    const result = await executor.execute('write_file', { overwrite: false }, context);
    expect({ success: result.success, toolRuns: run.mock.calls.length }).toEqual({ success: false, toolRuns: 1 });
  });
});
