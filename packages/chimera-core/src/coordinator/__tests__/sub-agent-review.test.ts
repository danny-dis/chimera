import { describe, expect, it, vi } from 'vitest';
import { SubAgentSpawner } from '../sub-agent-spawner.js';
import { EventStream } from '../../event-stream.js';
import type { SubTask } from '../types.js';

const task = (complete: any, extra: Partial<SubTask> = {}): SubTask => ({
  id: 'worker', description: 'Write the assigned files', dependencies: [], context: '',
  provider: { complete }, estimatedTokens: 10, ...extra,
});

describe('sub-agent review regressions', () => {
  it('a successful different write does not erase a denied write', async () => {
    const complete = vi.fn().mockResolvedValueOnce({ content: '', toolCalls: [
      { id: 'a', name: 'write_file', arguments: { path: 'a.ts', content: 'a' } },
      { id: 'b', name: 'write_file', arguments: { path: 'b.ts', content: 'b' } },
    ] }).mockResolvedValue({ content: 'all done' });
    const execute = vi.fn(async (_name, args) => args.path === 'a.ts'
      ? { success: false, error: 'Permission denied for a.ts', duration: 0 }
      : { success: true, data: {}, duration: 0 });
    const spawner = new SubAgentSpawner(new EventStream(), {}, undefined, { maxRetries: 0 }, {
      toolExecutor: { execute }, workspaceRoot: process.cwd(), mode: 'code',
    });
    const [result] = await spawner.executeAll([task(complete, {
      tools: [{ name: 'write_file', description: 'Write', parameters: { type: 'object' } }],
    })]);
    expect(result.status).toBe('error');
    expect(result.error).toContain('Permission denied for a.ts');
  });

  it('reports the allocated worktree when creation outlives cancellation', async () => {
    const info = { worktreePath: process.cwd(), branch: 'pending', headCommit: 'abc', gitRoot: process.cwd() };
    const controller = new AbortController();
    let finish!: (value: typeof info) => void;
    const isolation = { createIsolatedWorktree: vi.fn((_id, options) => {
      options?.onAllocated(info);
      controller.abort(new Error('cancel during creation'));
      return new Promise(resolve => { finish = resolve; });
    }) };
    const complete = vi.fn().mockResolvedValue({ content: 'unexpected' });
    const spawner = new SubAgentSpawner(new EventStream(), {}, undefined, { maxRetries: 0 }, {
      workspaceRoot: process.cwd(), worktreeIsolation: isolation as any, signal: controller.signal,
    });
    const [result] = await spawner.executeAll([task(complete, { isolated: true })]);
    finish(info);
    await Promise.resolve();
    expect(result.status).toBe('error');
    expect(result.worktree).toEqual(info);
    expect(complete).not.toHaveBeenCalled();
  });

  it('retries reuse and retain the original worktree even on exhaustion', async () => {
    const info = { worktreePath: process.cwd(), branch: 'retained', headCommit: 'abc', gitRoot: process.cwd() };
    const isolation = { createIsolatedWorktree: vi.fn().mockResolvedValue(info) };
    const spawner = new SubAgentSpawner(new EventStream(), {}, undefined, { maxRetries: 1, baseBackoffMs: 1 }, {
      workspaceRoot: process.cwd(), worktreeIsolation: isolation as any,
    });
    const [result] = await spawner.executeAll([task(vi.fn().mockRejectedValue(new Error('429')), { isolated: true })]);
    expect(result.worktree).toEqual(info);
    expect(isolation.createIsolatedWorktree).toHaveBeenCalledTimes(1);
  });
});
