import { describe, it, expect } from 'vitest';
import { SessionOrchestrator, type LLMProvider } from '../session-orchestrator.js';
import type { Mode } from '../types/agent.js';
import type { SessionCheckpoint } from '../session-orchestrator.js';

function mockStructuredProvider(data: Record<string, unknown>): LLMProvider {
  return {
    async complete() {
      return {
        content: JSON.stringify(data),
        usage: { inputTokens: 100, outputTokens: 200 },
      };
    },
  };
}

describe('SessionOrchestrator — exportState & restoreState', () => {
  describe('exportState (fresh orchestrator)', () => {
    it('returns the basic checkpoint shape for an idle orchestrator', () => {
      const orch = new SessionOrchestrator();
      const state = orch.exportState('s-1', 'a task', 'ask');

      expect(state.sessionId).toBe('s-1');
      expect(state.task).toBe('a task');
      expect(state.mode).toBe('ask');
      expect(state.messages).toEqual([]);
      expect(state.events).toEqual([]);
      expect(state.metadata.status).toBe('active');
      expect(state.metadata.agentCount).toBe(0);
      expect(state.metadata.turnCount).toBe(0);
      expect(state.toolCallHistory).toEqual([]);
    });

    it('includes a parseable ISO timestamp', () => {
      const orch = new SessionOrchestrator();
      const state = orch.exportState('s-1', 't', 'ask');
      expect(() => new Date(state.timestamp)).not.toThrow();
      expect(new Date(state.timestamp).toISOString()).toBe(state.timestamp);
    });

    it('reflects state.status correctly (completed / failed)', () => {
      const orch = new SessionOrchestrator();
      orch['state'] = { status: 'complete', result: 'done', cost: 1 };
      expect(orch.exportState('s', 't', 'ask').metadata.status).toBe('completed');
      orch['state'] = { status: 'error', error: 'fail' };
      expect(orch.exportState('s', 't', 'ask').metadata.status).toBe('failed');
    });
  });

  describe('exportState (post-execution)', () => {
    it('captures real cost spend, agent count, and turn count after execute', async () => {
      const orch = new SessionOrchestrator();
      const provider = mockStructuredProvider({ response: 'x', confidence: 0.9, rationale: 'r' });
      await orch.execute({
        task: 'do something',
        mode: 'ask',
        providers: { writer: provider, reviewer: provider },
      });

      const state = orch.exportState('s-2', 'do something', 'ask');
      expect(state.metadata.turnCount).toBe(1);
      expect(state.metadata.agentCount).toBeGreaterThanOrEqual(1);
      expect(Object.values(state.costSpend).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
      expect(state.task).toBe('do something');
      expect(state.mode).toBe('ask');
      expect(state.metadata.status).toBe('completed');
    });

    it('captures last classified complexity in metadata', async () => {
      const orch = new SessionOrchestrator();
      const provider = mockStructuredProvider({ response: 'x', confidence: 0.9, rationale: 'r' });
      await orch.execute({
        task: 'classify me',
        mode: 'ask',
        providers: { writer: provider, reviewer: provider },
      });

      const state = orch.exportState('s-3', 'classify me', 'ask');
      expect(state.metadata.lastComplexity).toBeDefined();
      expect(typeof state.metadata.lastComplexity?.overall).toBe('number');
    });

    it('captures tool call history after a tool loop', async () => {
      let callCount = 0;
      const writerProvider: LLMProvider = {
        async complete() {
          callCount++;
          if (callCount === 1) {
            return {
              content: JSON.stringify({ response: '', confidence: 0.5 }),
              toolCalls: [{ id: 'tc-1', name: 'read_file', arguments: { path: 'a.ts' } }],
              usage: { inputTokens: 50, outputTokens: 50 },
            };
          }
          return {
            content: JSON.stringify({ response: 'done', confidence: 0.8, rationale: 'r' }),
            usage: { inputTokens: 50, outputTokens: 50 },
          };
        },
      };
      const reviewerProvider: LLMProvider = {
        async complete() {
          return {
            content: JSON.stringify({ response: 'OK', confidence: 0.9 }),
            usage: { inputTokens: 50, outputTokens: 50 },
          };
        },
      };

      const mockToolRegistry = {
        getAll: () => [
          {
            name: 'read_file',
            description: 'Read a file',
            parameters: { toJSON: () => ({ type: 'object', properties: { path: { type: 'string' } } }) },
          },
        ],
        has: (name: string) => name === 'read_file',
      };
      const mockToolExecutor = {
        execute: async () => ({ success: true, data: { content: 'x' }, duration: 5 }),
      };

      const orch = new SessionOrchestrator(undefined, {
        registry: mockToolRegistry,
        executor: mockToolExecutor,
      });
      await orch.execute({
        task: 'fix typo',
        mode: 'ask',
        providers: { writer: writerProvider, reviewer: reviewerProvider },
      });

      const state = orch.exportState('s-4', 'fix typo', 'ask');
      expect(state.toolCallHistory).toHaveLength(1);
      expect(state.toolCallHistory[0].toolName).toBe('read_file');
      expect(state.toolCallHistory[0].result.success).toBe(true);
    });

    it('captures message history including the user task and assistant response', async () => {
      const orch = new SessionOrchestrator();
      const provider = mockStructuredProvider({ response: 'the answer', confidence: 0.9, rationale: 'r' });
      await orch.execute({
        task: 'a question',
        mode: 'ask',
        providers: { writer: provider, reviewer: provider },
      });

      const state = orch.exportState('s-5', 'a question', 'ask');
      const roles = state.messages.map((m) => m.role);
      expect(roles).toContain('user');
      expect(roles).toContain('assistant');
      // The user message is wrapped by buildWriterPrompt; the original task
      // is preserved as a substring.
      const userMsgs = state.messages.filter((m) => m.role === 'user');
      expect(userMsgs.length).toBeGreaterThan(0);
      expect(userMsgs.some((m) => m.content.includes('a question'))).toBe(true);
    });

    it('caps toolCallHistory at 100 entries', async () => {
      const orch = new SessionOrchestrator();
      // Simulate 120 tool calls in history by directly appending
      for (let i = 0; i < 120; i++) {
        orch['toolCallHistory'].push({
          toolName: `tool-${i}`,
          args: { i },
          result: { success: true, data: {}, duration: 1 },
        });
      }
      const state = orch.exportState('s-6', 't', 'ask');
      expect(state.toolCallHistory).toHaveLength(100);
      // Last entry preserved
      expect(state.toolCallHistory[99].toolName).toBe('tool-119');
    });
  });

  describe('restoreState', () => {
    it('restores agentCount, turnCount, task, mode, and message history', async () => {
      const orch = new SessionOrchestrator();
      const provider = mockStructuredProvider({ response: 'x', confidence: 0.9, rationale: 'r' });
      await orch.execute({
        task: 'first task',
        mode: 'ask',
        providers: { writer: provider, reviewer: provider },
      });

      const snapshot = orch.exportState('s-7', 'first task', 'ask');
      const orch2 = new SessionOrchestrator();
      await orch2.restoreState(snapshot);

      const fresh = orch2.exportState('s-7', 'first task', 'ask');
      expect(fresh.metadata.agentCount).toBe(snapshot.metadata.agentCount);
      expect(fresh.metadata.turnCount).toBe(snapshot.metadata.turnCount);
      expect(fresh.task).toBe('first task');
      expect(fresh.mode).toBe('ask');
      expect(fresh.messages).toEqual(snapshot.messages);
    });

    it('restores the orchestrator into completed state for a completed checkpoint', async () => {
      const checkpoint: SessionCheckpoint = {
        sessionId: 's-8',
        timestamp: new Date().toISOString(),
        task: 't',
        mode: 'ask' as Mode,
        messages: [{ role: 'user', content: 'q' }],
        events: [],
        costSpend: { writer: 0.1 },
        metadata: { agentCount: 3, turnCount: 2, status: 'completed' },
        toolCallHistory: [],
      };
      const orch = new SessionOrchestrator();
      await orch.restoreState(checkpoint);
      expect(orch.getState().status).toBe('complete');
    });

    it('restores the orchestrator into error state for a failed checkpoint', async () => {
      const checkpoint: SessionCheckpoint = {
        sessionId: 's-9',
        timestamp: new Date().toISOString(),
        task: 't',
        mode: 'ask' as Mode,
        messages: [],
        events: [],
        costSpend: {},
        metadata: { agentCount: 1, turnCount: 1, status: 'failed' },
        toolCallHistory: [],
      };
      const orch = new SessionOrchestrator();
      await orch.restoreState(checkpoint);
      expect(orch.getState().status).toBe('error');
    });

    it('restores the orchestrator into idle state for an active checkpoint', async () => {
      const checkpoint: SessionCheckpoint = {
        sessionId: 's-10',
        timestamp: new Date().toISOString(),
        task: 't',
        mode: 'ask' as Mode,
        messages: [],
        events: [],
        costSpend: {},
        metadata: { agentCount: 1, turnCount: 1, status: 'active' },
        toolCallHistory: [],
      };
      const orch = new SessionOrchestrator();
      await orch.restoreState(checkpoint);
      expect(orch.getState().status).toBe('idle');
    });

    it('produces a checkpoint that round-trips cleanly through restore + export', async () => {
      const orch = new SessionOrchestrator();
      const provider = mockStructuredProvider({ response: 'r', confidence: 0.9, rationale: 'r' });
      await orch.execute({
        task: 'rt',
        mode: 'ask',
        providers: { writer: provider, reviewer: provider },
      });

      const original = orch.exportState('rt-1', 'rt', 'ask');
      const restored = new SessionOrchestrator();
      await restored.restoreState(original);
      const reExported = restored.exportState('rt-1', 'rt', 'ask');

      // Round-trip preserves the captured state (status may differ on restored side).
      expect(reExported.metadata.agentCount).toBe(original.metadata.agentCount);
      expect(reExported.metadata.turnCount).toBe(original.metadata.turnCount);
      expect(reExported.messages).toEqual(original.messages);
      expect(reExported.toolCallHistory).toEqual(original.toolCallHistory);
    });
  });
});
