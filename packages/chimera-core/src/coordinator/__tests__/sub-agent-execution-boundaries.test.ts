import { describe, expect, it, vi } from 'vitest';
import { SubAgentSpawner } from '../sub-agent-spawner.js';
import { EventStream } from '../../event-stream.js';
import type { SubTask } from '../types.js';

const task = (complete: any, extra: Partial<SubTask> = {}): SubTask => ({
  id: 'worker', description: 'Inspect the project', dependencies: [], context: '',
  provider: { complete }, estimatedTokens: 10, ...extra,
});
const tools = [{ name: 'read_file', description: 'Read', parameters: { type: 'object' } }];
const execute = () => vi.fn(async () => ({ success: true, data: { content: 'ok' }, duration: 0 }));
const spawner = (deps: any, config = {}) => new SubAgentSpawner(
  new EventStream(), config, undefined, { maxRetries: 0 }, deps,
);

describe('sub-agent execution boundaries', () => {
  it('correlates tool results and totals every provider round', async () => {
    const complete = vi.fn().mockResolvedValueOnce({
      content: '', toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { path: 'a.ts' } }],
      usage: { inputTokens: 10, outputTokens: 5 },
    }).mockImplementationOnce(async (messages: any[]) => {
      const result = messages.find(m => m.role === 'tool');
      return { content: result?.tool_call_id ?? result?.toolResultId ?? 'missing',
        usage: { inputTokens: 20, outputTokens: 5 } };
    });
    const [result] = await spawner({ toolExecutor: { execute: execute() }, workspaceRoot: process.cwd() })
      .executeAll([task(complete, { tools })]);
    expect(result.output).toBe('call-1');
    expect(result.tokensUsed).toBe(40);
  });

  it('does not run when isolation creation fails', async () => {
    const complete = vi.fn(async () => ({ content: 'done' }));
    const [result] = await spawner({ workspaceRoot: process.cwd(), worktreeIsolation: {
      createIsolatedWorktree: vi.fn().mockRejectedValue(new Error('git failed')),
    } }).executeAll([task(complete, { isolated: true })]);
    expect(result.status).toBe('error');
    expect(complete).not.toHaveBeenCalled();
  });

  it('retains isolated output without merging into the parent', async () => {
    const info = { worktreePath: process.cwd(), branch: 'child', headCommit: 'abc', gitRoot: process.cwd() };
    const isolation = { createIsolatedWorktree: vi.fn().mockResolvedValue(info), mergeBranch: vi.fn() };
    const [result] = await spawner({ workspaceRoot: process.cwd(), worktreeIsolation: isolation })
      .executeAll([task(vi.fn(async () => ({ content: 'done' })), { isolated: true })]);
    expect(isolation.mergeBranch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'success', worktree: info });
  });

  it('rejects already-aborted work before any provider call', async () => {
    const ac = new AbortController(); ac.abort();
    const complete = vi.fn(async () => ({ content: 'done' }));
    const [result] = await spawner({ signal: ac.signal }).executeAll([task(complete)]);
    expect(result.status).toBe('error');
    expect(complete).not.toHaveBeenCalled();
  });

  it('aborts the signal delivered to a timed-out provider', async () => {
    let signal: AbortSignal | undefined;
    const complete = vi.fn((_messages: unknown, options: any) => {
      signal = options.signal;
      return new Promise(() => {});
    });
    const [result] = await spawner({}, { taskTimeoutMs: 25 }).executeAll([task(complete)]);
    expect(result.status).toBe('timeout');
    expect(signal?.aborted).toBe(true);
  });
});
