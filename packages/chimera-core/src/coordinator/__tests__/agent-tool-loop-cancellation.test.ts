/**
 * Regression tests for agent-tool-loop cancellation handling.
 *
 * BUG: agent-tool-loop.ts:265 sleeps without cancellation:
 *     `await new Promise((r) => setTimeout(r, backoff));`
 *     No AbortSignal checking — abort during delay hangs until timeout.
 *
 * ADDITIONAL BUG: completeWithRetry retries EVERY error including
 *     abort errors. Should not retry on abort.
 *
 * EXPECTED (after fix):
 *   - Abort during backoff sleep exits promptly
 *   - No retry on abort error
 *   - Abort signal is threaded through provider.complete calls
 */
import { describe, it, expect, vi } from 'vitest';
import { runAgentToolLoop, type RunAgentToolLoopParams } from '../agent-tool-loop.js';
import { EventStream } from '../../event-stream.js';
import type { LLMProvider, ToolExecutorInterface, ToolRegistryInterface } from '../../session-orchestrator.js';
import type { ToolCall } from '../../types/agent.js';

function mockProvider(content: string, toolCalls?: ToolCall[]): LLMProvider {
  return {
    async complete() {
      return {
        content,
        toolCalls: toolCalls ?? [],
        usage: { inputTokens: 100, outputTokens: 100 },
      };
    },
  };
}

function mockExecutor(): ToolExecutorInterface {
  return {
    execute: vi.fn().mockResolvedValue({
      success: true,
      data: { content: 'result' },
      duration: 10,
    }),
  } as unknown as ToolExecutorInterface;
}

function mockRegistry(): ToolRegistryInterface {
  return {
    getAll: () => [],
    has: () => false,
  } as unknown as ToolRegistryInterface;
}

describe('agent-tool-loop cancellation', () => {
  it('should not retry on AbortError', async () => {
    let callCount = 0;
    const provider: LLMProvider = {
      async complete() {
        callCount++;
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    };

    const ac = new AbortController();
    const params: RunAgentToolLoopParams = {
      provider,
      messages: [{ role: 'user', content: 'test' }],
      options: {},
      toolExecutor: mockExecutor(),
      toolRegistry: mockRegistry(),
      eventStream: new EventStream(),
      workspaceRoot: '/tmp',
      sessionId: 'test',
      initialContent: 'test',
      initialToolCalls: [{ id: 'tc1', name: 'read_file', arguments: { path: 'test.ts' } }],
      maxRounds: 1,
      signal: ac.signal,
    };

    await expect(runAgentToolLoop(params)).rejects.toThrow();
    expect(callCount).toBe(1);
  });

  it('abort during backoff stops retry promptly', async () => {
    let callCount = 0;
    let abortAt = 1;
    const ac = new AbortController();
    const provider: LLMProvider = {
      async complete() {
        callCount++;
        if (callCount === abortAt) {
          ac.abort();
          throw new Error('transient network error');
        }
        return { content: 'ok', usage: { inputTokens: 10, outputTokens: 10 } };
      },
    };

    const params: RunAgentToolLoopParams = {
      provider,
      messages: [{ role: 'user', content: 'test' }],
      options: {},
      toolExecutor: mockExecutor(),
      toolRegistry: mockRegistry(),
      eventStream: new EventStream(),
      workspaceRoot: '/tmp',
      sessionId: 'test',
      initialContent: 'test',
      initialToolCalls: [{ id: 'tc1', name: 'read_file', arguments: { path: 'test.ts' } }],
      maxRounds: 1,
      signal: ac.signal,
    };

    const start = Date.now();
    await expect(runAgentToolLoop(params)).rejects.toThrow();
    const elapsed = Date.now() - start;
    expect(callCount).toBe(1);
    expect(elapsed).toBeLessThan(1500);
  });

  it('pre-aborted signal exits immediately', async () => {
    let callCount = 0;
    const ac = new AbortController();
    ac.abort();
    const provider: LLMProvider = {
      async complete() {
        callCount++;
        return { content: 'ok', usage: { inputTokens: 10, outputTokens: 10 } };
      },
    };
    const params: RunAgentToolLoopParams = {
      provider,
      messages: [{ role: 'user', content: 'test' }],
      options: {},
      toolExecutor: mockExecutor(),
      toolRegistry: mockRegistry(),
      eventStream: new EventStream(),
      workspaceRoot: '/tmp',
      sessionId: 'test',
      initialContent: 'test',
      initialToolCalls: [{ id: 'tc1', name: 'read_file', arguments: { path: 'test.ts' } }],
      maxRounds: 1,
      signal: ac.signal,
    };
    const start = Date.now();
    await expect(runAgentToolLoop(params)).rejects.toThrow();
    expect(callCount).toBe(0);
    expect(Date.now() - start).toBeLessThan(100);
  });
});
