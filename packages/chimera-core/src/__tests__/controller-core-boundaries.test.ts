import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionOrchestrator, type LLMProvider, type ToolExecutorInterface } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';
import { runAgentToolLoop, type RunAgentToolLoopParams } from '../coordinator/agent-tool-loop.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-core-boundary-'));
  const controller = new AbortController();
  const execute = vi.fn().mockResolvedValue({ success: true, data: 'owned probe', duration: 0 });
  const complete = vi.fn().mockResolvedValue({ content: 'ok', usage: { inputTokens: 1, outputTokens: 1 } });
  const params: RunAgentToolLoopParams = {
    provider: { complete }, messages: [{ role: 'user', content: 'inspect file' }], options: {},
    toolExecutor: { execute } as unknown as ToolExecutorInterface,
    toolRegistry: null, eventStream: new EventStream(), workspaceRoot: root, sessionId: 'controller',
    initialContent: 'read', initialToolCalls: [{ id: 'probe', name: 'read_file', arguments: { path: 'owned.txt' } }],
    maxRounds: 1, signal: controller.signal,
  };
  return { params, controller, execute, complete, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

describe('controller core cancellation and actual-spend boundaries', () => {
  it('pre-abort prevents tools as well as provider calls', async () => {
    const f = fixture();
    try {
      f.controller.abort();
      await runAgentToolLoop(f.params).catch(() => undefined);
      expect({ tools: f.execute.mock.calls.length, providers: f.complete.mock.calls.length }).toEqual({ tools: 0, providers: 0 });
    } finally { f.cleanup(); }
  });

  it('forwards the owned signal to provider and tool execution', async () => {
    const f = fixture();
    try {
      await runAgentToolLoop(f.params);
      expect(f.complete.mock.calls[0]?.[1]?.signal).toBe(f.controller.signal);
      expect(f.execute.mock.calls[0]?.[2]?.signal).toBe(f.controller.signal);
    } finally { f.cleanup(); }
  });

  it('abort during an actual backoff prevents another provider attempt', async () => {
    const f = fixture();
    try {
      f.complete.mockRejectedValue(new Error('transient'));
      f.params.eventStream.subscribe('*', event => {
        if ((event.type as string) === 'llm_retry') queueMicrotask(() => f.controller.abort());
      });
      await expect(runAgentToolLoop(f.params)).rejects.toThrow(/abort/i);
      expect(f.complete).toHaveBeenCalledTimes(1);
    } finally { f.controller.abort(); f.cleanup(); }
  });

  it('actual writer spend above the cap prevents reviewer admission', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-budget-probe-'));
    const writerComplete = vi.fn().mockResolvedValue({
      content: JSON.stringify({ response: 'proposal', confidence: 0.9 }), usage: { inputTokens: 100, outputTokens: 200 },
    });
    const reviewerComplete = vi.fn().mockResolvedValue({
      content: JSON.stringify({ verdict: 'PASS', confidence: 0.9, findings: [] }), usage: { inputTokens: 100, outputTokens: 200 },
    });
    const writer: LLMProvider = {
      complete: writerComplete, getCost: () => 11,
      getPricing: () => ({ inputPerMillion: 110_000, outputPerMillion: 0 }),
    };
    try {
      const result = await new SessionOrchestrator(new EventStream(), undefined, root).execute({
        task: 'implement feature', mode: 'code', costCap: 10, providers: { writer, reviewer: { complete: reviewerComplete } },
      });
      expect(writerComplete).toHaveBeenCalledTimes(1);
      expect(result.cost).toBeGreaterThanOrEqual(10);
      expect(reviewerComplete).not.toHaveBeenCalled();
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('zero budget refuses conversational provider calls', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-budget-zero-'));
    const complete = vi.fn().mockResolvedValue({ content: 'hello', usage: { inputTokens: 1, outputTokens: 1 } });
    try {
      await new SessionOrchestrator(new EventStream(), undefined, root).execute({
        task: 'Hello', mode: 'ask', costCap: 0, providers: { writer: { complete }, reviewer: { complete } },
      });
      expect(complete).not.toHaveBeenCalled();
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
