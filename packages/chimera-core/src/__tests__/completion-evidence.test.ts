import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionOrchestrator, type ToolExecutorInterface } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';
import { runToolCalls } from '../coordinator/tool-execution-helper.js';

const usage = { inputTokens: 1, outputTokens: 1 };
const writer = { complete: async () => ({ content: JSON.stringify({ response: 'COMPLETE', confidence: 0.9 }), usage }) };
const reviewer = { complete: async () => ({ content: JSON.stringify({ verdict: 'PASS', confidence: 0.9, findings: [] }), usage }) };

async function run(check: () => Promise<any>, commands: string[] | undefined = ['caller check']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-proof-'));
  const controller = new AbortController();
  const execute = vi.fn(async () => check());
  const orchestrator = new SessionOrchestrator(new EventStream(), {
    registry: { has: name => name === 'shell', getAll: () => [] },
    executor: { execute } as ToolExecutorInterface,
  }, root);
  try {
    const result = await orchestrator.execute({ task: 'implement feature', mode: 'code', providers: { writer, reviewer },
      verificationCommands: commands, signal: controller.signal } as any);
    return { result, execute, root, signal: controller.signal };
  } finally { orchestrator.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
}

describe('caller-owned completion evidence', () => {
  it('executes caller check with root, mode and composed signal; no mutation is required', async () => {
    const { result, execute, root, signal } = await run(async () => ({ success: true, data: { exitCode: 0 }, duration: 0 }));
    expect(execute).toHaveBeenCalledWith('shell', { command: 'caller check' }, expect.objectContaining({ workspaceRoot: root, mode: 'code', signal: expect.any(AbortSignal) }));
    expect(signal.aborted).toBe(false);
    expect(result.status).toBe('done');
    expect((result as any).verification.verified).toBe(true);
  });

  it.each([
    ['failed', { success: true, data: { exitCode: 1 }, duration: 0 }],
    ['denied', { success: false, error: 'Permission denied', duration: 0 }],
    ['missing exit status', { success: true, data: {}, duration: 0 }],
  ])('%s check cannot verify completion', async (_name, toolResult) => {
    const { result, execute } = await run(async () => toolResult);
    expect(execute).toHaveBeenCalledTimes(_name === 'failed' ? 2 : 1);
    expect(result.status).toBe('needs_user');
    expect((result as any).verification.verified).toBe(false);
  });

  it('empty commands cannot verify COMPLETE prose', async () => {
    const { result, execute } = await run(async () => ({ success: true, data: { exitCode: 0 }, duration: 0 }), []);
    expect(execute).not.toHaveBeenCalled();
    expect(result.status).toBe('needs_user');
  });

  it('pre-aborted session does not call a provider', async () => {
    const controller = new AbortController(); controller.abort();
    const complete = vi.fn().mockResolvedValue({ content: 'hello', usage });
    const orchestrator = new SessionOrchestrator();
    try {
      const result = await orchestrator.execute({ task: 'Hello', mode: 'ask', providers: { writer: { complete }, reviewer }, signal: controller.signal } as any);
      expect(complete).not.toHaveBeenCalled();
      expect(result.status).not.toBe('done');
    } finally { orchestrator.dispose(); }
  });

  it('abort during tool batch prevents the next tool', async () => {
    const controller = new AbortController();
    const execute = vi.fn(async () => { controller.abort(); return { success: true, duration: 0 }; });
    await expect(runToolCalls({ toolCalls: ['a', 'b'].map(id => ({ id, name: 'read_file', arguments: {} })),
      toolExecutor: { execute }, eventStream: new EventStream(), workspaceRoot: os.tmpdir(), sessionId: 'test', signal: controller.signal,
    })).rejects.toThrow(/abort/i);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
