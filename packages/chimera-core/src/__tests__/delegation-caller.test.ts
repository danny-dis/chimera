import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { EventStream } from '../event-stream.js';
import { SessionOrchestrator } from '../session-orchestrator.js';

describe('real delegation caller wiring', () => {
  it('passes registered tools, workspace, mode and caller cancellation to a child', async () => {
    const controller = new AbortController();
    const provider = { complete: vi.fn()
      .mockResolvedValueOnce({ content: JSON.stringify({ subTasks: [{ id: 'one', description: 'child', dependencies: [] }], strategy: 'sequential', rationale: '' }) })
      .mockResolvedValueOnce({ content: '', toolCalls: [{ id: '1', name: 'read_file', arguments: { path: 'test.txt' } }] })
      .mockResolvedValueOnce({ content: 'read complete' }) };
    const executor = { execute: vi.fn(async (_name, _args, context) => {
      expect(context.workspaceRoot).toBe(process.cwd());
      expect(context.mode).toBe('review');
      expect(context.signal).toBeInstanceOf(AbortSignal);
      controller.abort();
      return { success: true, data: { text: 'content' }, duration: 0 };
    }) };
    const orch = new SessionOrchestrator(new EventStream(), { registry: { has: () => true, getAll: () => [{ name: 'read_file', description: 'read', parameters: z.object({ path: z.string() }) }] } as any, executor }, process.cwd());
    (orch as any)._completion = { mode: 'review' };
    const result = await (orch as any).runDelegated('task', provider, controller.signal);
    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(result.resolved).toBe(false);
    expect(result.subTaskResults[0].status).not.toBe('success');
    expect(provider.complete).toHaveBeenCalledTimes(2);
    orch.dispose();
  });
});
