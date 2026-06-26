/**
 * Tests for `WorkflowDispatcher`.
 *
 * Coverage: dispatch lifecycle (queued → running → success/error), status
 * polling, result retrieval, cancellation, concurrency limits, event
 * emission, and eviction of old runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventStream } from '../../event-stream.js';
import { WorkflowDispatcher } from '../dispatcher.js';
import type { WorkflowDefinition, WorkflowHandlers } from '../types.js';
import type { LLMProvider } from '../../session-orchestrator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noopProvider(
  content = '{}',
  usage = { inputTokens: 10, outputTokens: 20 },
): LLMProvider {
  return {
    async complete() {
      return { content, usage };
    },
  };
}

function makeHandlers(overrides: Partial<WorkflowHandlers> = {}): WorkflowHandlers {
  const providers: Record<string, LLMProvider> = {
    writer: noopProvider(),
    reviewer: noopProvider(JSON.stringify({ verdict: 'PASS' })),
    ...((overrides.providers as Record<string, LLMProvider> | undefined) ?? {}),
  };
  return { providers, ...overrides, providers };
}

function simpleWorkflow(name = 'test-wf'): WorkflowDefinition {
  return {
    name,
    steps: [{ id: 'step1', kind: 'llm', config: { role: 'writer', prompt: 'hello' } }],
  };
}

function multiStepWorkflow(): WorkflowDefinition {
  return {
    name: 'multi-step',
    steps: [
      { id: 'draft', kind: 'llm', config: { role: 'writer', prompt: 'write' } },
      { id: 'review', kind: 'llm', config: { role: 'reviewer', prompt: 'review' } },
    ],
  };
}

function failingWorkflow(): WorkflowDefinition {
  return {
    name: 'failing',
    steps: [
      { id: 'step1', kind: 'llm', config: { role: 'nonexistent' } },
    ],
  };
}

/** Wait for background tasks to complete. */
function flush(ms = 150): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowDispatcher', () => {
  let dispatcher: WorkflowDispatcher;
  let eventStream: EventStream;

  beforeEach(() => {
    eventStream = new EventStream();
    dispatcher = new WorkflowDispatcher({
      maxConcurrency: 2,
      eventStream,
      maxRetainedRuns: 10,
    });
  });

  afterEach(() => {
    dispatcher = undefined!;
  });

  describe('dispatch', () => {
    it('returns immediately with workflowRunId and status queued', () => {
      const result = dispatcher.dispatch(simpleWorkflow(), {
        handlers: makeHandlers(),
      });

      expect(result.workflowRunId).toMatch(/^wf-/);
      expect(result.status).toBe('queued');
    });

    it('creates a tracked run entry', () => {
      const { workflowRunId } = dispatcher.dispatch(simpleWorkflow(), {
        handlers: makeHandlers(),
      });

      const status = dispatcher.getStatus(workflowRunId);
      expect(status).toBeDefined();
      expect(status!.workflowName).toBe('test-wf');
      // Status may be 'queued' or 'running' depending on microtask timing
      expect(['queued', 'running', 'success']).toContain(status!.status);
      expect(status!.totalSteps).toBe(1);
    });

    it('emits workflow_dispatched event', () => {
      dispatcher.dispatch(simpleWorkflow('my-wf'), {
        handlers: makeHandlers(),
      });

      const events = eventStream.getByType('workflow_dispatched' as any);
      expect(events).toHaveLength(1);
      expect((events[0] as any).workflowName).toBe('my-wf');
    });

    it('uses provided runId when given', () => {
      const { workflowRunId } = dispatcher.dispatch(simpleWorkflow(), {
        handlers: makeHandlers(),
        runId: 'custom-id',
      });

      expect(workflowRunId).toBe('custom-id');
      expect(dispatcher.getStatus('custom-id')).toBeDefined();
    });
  });

  describe('async execution', () => {
    it('completes successfully and stores result', async () => {
      const { workflowRunId } = dispatcher.dispatch(simpleWorkflow(), {
        handlers: makeHandlers(),
      });

      await flush();

      const status = dispatcher.getStatus(workflowRunId);
      expect(status!.status).toBe('success');
      expect(status!.completedAt).toBeDefined();
      expect(status!.durationMs).toBeGreaterThanOrEqual(0);
      expect(status!.stepsCompleted).toBe(1);

      const result = dispatcher.getResult(workflowRunId);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('success');
      expect(result!.workflowName).toBe('test-wf');
    });

    it('returns null for result before completion', () => {
      const { workflowRunId } = dispatcher.dispatch(simpleWorkflow(), {
        handlers: makeHandlers(),
      });

      // Check immediately — may still be queued/running
      const result = dispatcher.getResult(workflowRunId);
      // Result should be null if not yet success
      const status = dispatcher.getStatus(workflowRunId)!.status;
      if (status !== 'success') {
        expect(result).toBeNull();
      }
    });

    it('emits workflow_run_completed event on success', async () => {
      dispatcher.dispatch(simpleWorkflow('completed-wf'), {
        handlers: makeHandlers(),
      });

      await flush();

      const events = eventStream.getByType('workflow_run_completed' as any);
      expect(events.length).toBeGreaterThanOrEqual(1);
      const last = events[events.length - 1] as any;
      expect(last.name).toBe('completed-wf');
      expect(last.status).toBe('success');
    });
  });

  describe('error handling', () => {
    it('sets status to error when workflow fails', async () => {
      const { workflowRunId } = dispatcher.dispatch(failingWorkflow(), {
        handlers: makeHandlers(),
      });

      await flush();

      const status = dispatcher.getStatus(workflowRunId);
      expect(status!.status).toBe('error');
      expect(status!.error).toBeDefined();
      expect(status!.completedAt).toBeDefined();
    });

    it('emits workflow_dispatch_failed event on error', async () => {
      dispatcher.dispatch(failingWorkflow(), {
        handlers: makeHandlers(),
      });

      await flush();

      const events = eventStream.getByType('workflow_dispatch_failed' as any);
      expect(events).toHaveLength(1);
      expect((events[0] as any).error).toBeDefined();
    });

    it('returns null for result on error', async () => {
      const { workflowRunId } = dispatcher.dispatch(failingWorkflow(), {
        handlers: makeHandlers(),
      });

      await flush();

      expect(dispatcher.getResult(workflowRunId)).toBeNull();
    });
  });

  describe('listRuns', () => {
    it('returns dispatched runs', async () => {
      dispatcher.dispatch(simpleWorkflow('first'), { handlers: makeHandlers() });
      dispatcher.dispatch(simpleWorkflow('second'), { handlers: makeHandlers() });
      dispatcher.dispatch(simpleWorkflow('third'), { handlers: makeHandlers() });

      await flush();

      const runs = dispatcher.listRuns();
      expect(runs).toHaveLength(3);
      // All should be completed
      expect(runs.every((r) => r.status === 'success' || r.status === 'error')).toBe(true);
    });

    it('includes completed and failed runs', async () => {
      dispatcher.dispatch(failingWorkflow(), { handlers: makeHandlers() });
      dispatcher.dispatch(simpleWorkflow(), { handlers: makeHandlers() });

      await flush();

      const runs = dispatcher.listRuns();
      expect(runs).toHaveLength(2);
      expect(runs.map((r) => r.status)).toContain('error');
      expect(runs.map((r) => r.status)).toContain('success');
    });
  });

  describe('cancel', () => {
    it('cancels a queued run', () => {
      const { workflowRunId } = dispatcher.dispatch(simpleWorkflow(), {
        handlers: makeHandlers(),
      });

      // Cancel immediately (before worker picks it up)
      const cancelled = dispatcher.cancel(workflowRunId);
      expect(cancelled).toBe(true);

      const status = dispatcher.getStatus(workflowRunId);
      expect(status!.status).toBe('cancelled');
    });

    it('returns false for unknown run id', () => {
      expect(dispatcher.cancel('nonexistent')).toBe(false);
    });

    it('emits workflow_run_completed event with cancelled status', () => {
      const { workflowRunId } = dispatcher.dispatch(simpleWorkflow('cancel-wf'), {
        handlers: makeHandlers(),
      });

      dispatcher.cancel(workflowRunId);

      const events = eventStream.getByType('workflow_run_completed' as any);
      expect(events).toHaveLength(1);
      expect((events[0] as any).status).toBe('cancelled');
      expect((events[0] as any).name).toBe('cancel-wf');
    });
  });

  describe('eviction', () => {
    it('evicts oldest runs when exceeding maxRetainedRuns', async () => {
      const smallDispatcher = new WorkflowDispatcher({
        maxConcurrency: 4,
        eventStream,
        maxRetainedRuns: 3,
      });

      // Dispatch 5 workflows
      smallDispatcher.dispatch(simpleWorkflow('w1'), { handlers: makeHandlers() });
      smallDispatcher.dispatch(simpleWorkflow('w2'), { handlers: makeHandlers() });
      smallDispatcher.dispatch(simpleWorkflow('w3'), { handlers: makeHandlers() });
      smallDispatcher.dispatch(simpleWorkflow('w4'), { handlers: makeHandlers() });
      smallDispatcher.dispatch(simpleWorkflow('w5'), { handlers: makeHandlers() });

      // Wait for all to complete
      await flush(300);

      // Should retain only the last 3
      const runs = smallDispatcher.listRuns();
      expect(runs.length).toBeLessThanOrEqual(3);
      // The retained ones should be the newest
      expect(runs.map((r) => r.workflowName)).toContain('w5');
    });
  });

  describe('concurrency', () => {
    it('respects maxConcurrency limit', async () => {
      let running = 0;
      let maxRunning = 0;

      const trackingProvider: LLMProvider = {
        async complete() {
          running++;
          maxRunning = Math.max(maxRunning, running);
          await flush(30);
          running--;
          return { content: '{}', usage: { inputTokens: 1, outputTokens: 1 } };
        },
      };

      const concurrentDispatcher = new WorkflowDispatcher({
        maxConcurrency: 2,
        eventStream,
      });

      // Dispatch 5 workflows simultaneously
      for (let i = 0; i < 5; i++) {
        concurrentDispatcher.dispatch(simpleWorkflow(`concurrent-${i}`), {
          handlers: { providers: { writer: trackingProvider } },
        });
      }

      await flush(500);

      // maxRunning should never exceed 2
      expect(maxRunning).toBeLessThanOrEqual(2);
    });
  });

  describe('step tracking', () => {
    it('updates stepsCompleted as steps finish', async () => {
      const { workflowRunId } = dispatcher.dispatch(multiStepWorkflow(), {
        handlers: makeHandlers(),
      });

      await flush(200);

      const status = dispatcher.getStatus(workflowRunId);
      expect(status!.stepsCompleted).toBe(2);
      expect(status!.totalSteps).toBe(2);
    });
  });
});
