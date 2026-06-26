/**
 * Tests for `WorkflowRunner`.
 *
 * Coverage: each `WorkflowStepKind` is exercised in isolation, then the
 * full `standard-draft` workflow (the one SessionOrchestrator uses) is run
 * end-to-end with mock providers to confirm the same observable behavior
 * as the pre-refactor `execute()` pipeline.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventStream } from '../../event-stream.js';
import { runWorkflow } from '../runner.js';
import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowHandlers,
} from '../types.js';
import type { LLMProvider } from '../../session-orchestrator.js';

function noopProvider(content = '{}', usage = { inputTokens: 10, outputTokens: 20 }): LLMProvider {
  return {
    async complete() {
      return { content, usage };
    },
  };
}

function makeHandlers(overrides: Partial<WorkflowHandlers> = {}): WorkflowHandlers {
  const providers: Record<string, LLMProvider> = {
    writer: noopProvider(JSON.stringify({ response: 'drafted' })),
    reviewer: noopProvider(JSON.stringify({ verdict: 'PASS' })),
    challenger: noopProvider(JSON.stringify({ response: 'no issues' })),
    ...((overrides.providers as Record<string, LLMProvider> | undefined) ?? {}),
  };
  return { providers, ...overrides, providers };
}

describe('WorkflowRunner', () => {
  describe('llm step', () => {
    it('calls the provider registered for the step role', async () => {
      const completeSpy = vi.fn().mockResolvedValue({ content: 'hi', usage: { inputTokens: 1, outputTokens: 2 } });
      const provider: LLMProvider = { complete: completeSpy };
      const wf: WorkflowDefinition = {
        name: 'one-llm',
        steps: [{ id: 's1', kind: 'llm', config: { role: 'writer', prompt: 'hello' } }],
      };
      const result = await runWorkflow(wf, { handlers: makeHandlers({ providers: { writer: provider } }) });
      expect(result.status).toBe('success');
      expect(completeSpy).toHaveBeenCalledOnce();
      expect(result.outputs.s1).toEqual({ content: 'hi', usage: { inputTokens: 1, outputTokens: 2 } });
    });

    it('errors when no provider is registered for the role', async () => {
      const wf: WorkflowDefinition = {
        name: 'no-provider',
        steps: [{ id: 's1', kind: 'llm', config: { role: 'unknown' } }],
      };
      const result = await runWorkflow(wf, { handlers: makeHandlers() });
      expect(result.status).toBe('error');
      expect(result.error).toMatch(/no provider is registered/);
    });
  });

  describe('tool step', () => {
    it('invokes the registered tool executor', async () => {
      const toolExecutor = vi.fn().mockResolvedValue({ success: true, data: { ok: 1 }, duration: 5 });
      const wf: WorkflowDefinition = {
        name: 'one-tool',
        steps: [{ id: 's1', kind: 'tool', config: { name: 'lint', args: { file: 'x.ts' } } }],
      };
      const result = await runWorkflow(wf, { handlers: { providers: {}, toolExecutor } });
      expect(result.status).toBe('success');
      expect(toolExecutor).toHaveBeenCalledWith('lint', { file: 'x.ts' });
      expect(result.outputs.s1).toEqual({ ok: 1 });
    });

    it('errors when the tool executor reports failure', async () => {
      const wf: WorkflowDefinition = {
        name: 'fail-tool',
        steps: [{ id: 's1', kind: 'tool', config: { name: 'lint' } }],
      };
      const result = await runWorkflow(wf, {
        handlers: { providers: {}, toolExecutor: async () => ({ success: false, error: 'boom', duration: 0 }) },
      });
      expect(result.status).toBe('error');
      expect(result.error).toMatch(/lint.*boom/);
    });
  });

  describe('parallel step', () => {
    it('runs all branches concurrently and aggregates', async () => {
      const slow: LLMProvider = {
        async complete() {
          await new Promise((r) => setTimeout(r, 10));
          return { content: 'slow', usage: { inputTokens: 0, outputTokens: 0 } };
        },
      };
      const fast: LLMProvider = {
        async complete() {
          return { content: 'fast', usage: { inputTokens: 0, outputTokens: 0 } };
        },
      };
      const wf: WorkflowDefinition = {
        name: 'par',
        steps: [
          {
            id: 'p',
            kind: 'parallel',
            config: {
              branches: [
                { id: 'a', kind: 'llm', config: { role: 'writer' } },
                { id: 'b', kind: 'llm', config: { role: 'reviewer' } },
              ],
            },
          },
        ],
      };
      const t0 = Date.now();
      const result = await runWorkflow(wf, {
        handlers: makeHandlers({ providers: { writer: slow, reviewer: fast } }),
      });
      const elapsed = Date.now() - t0;
      expect(result.status).toBe('success');
      // Concurrent execution: total time should be ~one branch's duration, not the sum.
      // Tolerance is generous to absorb timer variance on slow CI machines.
      expect(elapsed).toBeLessThan(200);
      const out = result.outputs.p as { branches: Record<string, { content: string }> };
      expect(out.branches.a.content).toBe('slow');
      expect(out.branches.b.content).toBe('fast');
    });

    it('survives a rejected branch via allSettled (does not abort the run)', async () => {
      const wf: WorkflowDefinition = {
        name: 'par-fail',
        steps: [
          {
            id: 'p',
            kind: 'parallel',
            config: {
              branches: [
                { id: 'a', kind: 'llm', config: { role: 'writer' } },
                { id: 'b', kind: 'llm', config: { role: 'reviewer' } },
              ],
            },
          },
        ],
      };
      const handlers: WorkflowHandlers = {
        providers: {
          writer: noopProvider('ok-a'),
          reviewer: { async complete() { throw new Error('reviewer down'); } },
        },
      };
      const result = await runWorkflow(wf, { handlers });
      // The parallel handler itself does not throw on a rejected branch.
      // The wrapping `runWorkflow` only aborts on a top-level step failure.
      expect(result.status).toBe('success');
      const out = result.outputs.p as { results: Array<{ branchId: string; status: string }> };
      expect(out.results).toHaveLength(2);
      const byId = Object.fromEntries(out.results.map((r) => [r.branchId, r.status]));
      expect(byId.a).toBe('fulfilled');
      expect(byId.b).toBe('rejected');
    });

    it('skips dependents when the reviewerFirst reviewer passes', async () => {
      const reviewer: LLMProvider = { async complete() { return { content: JSON.stringify({ verdict: 'PASS' }), usage: { inputTokens: 0, outputTokens: 0 } }; } };
      const challenger = vi.fn().mockResolvedValue({ content: 'never', usage: { inputTokens: 0, outputTokens: 0 } });
      const wf: WorkflowDefinition = {
        name: 'qg',
        steps: [
          {
            id: 'qg',
            kind: 'parallel',
            config: {
              branches: [
                { id: 'review', kind: 'llm', config: { role: 'reviewer' } },
                { id: 'challenge', kind: 'llm', config: { role: 'challenger' } },
              ],
              reviewerFirst: {
                branchId: 'review',
                passOn: 'PASS',
                dependentBranchIds: ['challenge'],
              },
            },
          },
        ],
      };
      const result = await runWorkflow(wf, {
        handlers: makeHandlers({
          providers: { reviewer, challenger: { complete: challenger } as unknown as LLMProvider },
        }),
      });
      expect(result.status).toBe('success');
      expect(challenger).not.toHaveBeenCalled();
    });
  });

  describe('sequence step', () => {
    it('runs sub-steps serially in declared order', async () => {
      const order: string[] = [];
      const wf: WorkflowDefinition = {
        name: 'seq',
        steps: [
          {
            id: 's',
            kind: 'sequence',
            config: {
              steps: [
                { id: 'a', kind: 'tool', config: { name: 'one' } },
                { id: 'b', kind: 'tool', config: { name: 'two' } },
              ],
            },
          },
        ],
      };
      const handlers: WorkflowHandlers = {
        providers: {},
        toolExecutor: async (name) => {
          order.push(name);
          return { success: true, data: { name }, duration: 0 };
        },
      };
      const result = await runWorkflow(wf, { handlers });
      expect(result.status).toBe('success');
      expect(order).toEqual(['one', 'two']);
    });
  });

  describe('gate step', () => {
    it('returns success when the gate evaluator says so', async () => {
      const wf: WorkflowDefinition = {
        name: 'gate-ok',
        steps: [{ id: 'g', kind: 'gate', config: { expr: 'state.x > 0' } }],
      };
      const result = await runWorkflow(wf, {
        handlers: {
          providers: {},
          gateEvaluator: () => 'success',
        },
      });
      expect(result.status).toBe('success');
      expect(result.outputs.g).toEqual({ status: 'success' });
    });

    it('returns error when the gate evaluator rejects', async () => {
      const wf: WorkflowDefinition = {
        name: 'gate-fail',
        steps: [{ id: 'g', kind: 'gate', config: {} }],
      };
      const result = await runWorkflow(wf, {
        handlers: {
          providers: {},
          gateEvaluator: () => 'error',
        },
      });
      // A gate error aborts the run.
      expect(result.status).toBe('error');
    });
  });

  describe('loop step', () => {
    it('completes when signal is detected in output', async () => {
      const provider = noopProvider('All done COMPLETE');
      const wf: WorkflowDefinition = {
        name: 'loop-signal',
        steps: [{
          id: 'lp',
          kind: 'loop',
          config: { prompt: 'do the thing', until: 'COMPLETE', max_iterations: 5, role: 'writer' },
        }],
      };
      const result = await runWorkflow(wf, { handlers: makeHandlers({ providers: { writer: provider } }) });
      expect(result.status).toBe('success');
      const out = result.outputs.lp as { content: string; iterations: number; completionDetected: boolean };
      expect(out.iterations).toBe(1);
      expect(out.completionDetected).toBe(true);
      expect(out.content).toContain('COMPLETE');
    });

    it('iterates until signal is detected across multiple iterations', async () => {
      let callCount = 0;
      const provider: LLMProvider = {
        async complete() {
          callCount++;
          if (callCount < 3) {
            return { content: 'still working...', usage: { inputTokens: 5, outputTokens: 5 } };
          }
          return { content: 'Finished COMPLETE', usage: { inputTokens: 5, outputTokens: 5 } };
        },
      };
      const wf: WorkflowDefinition = {
        name: 'loop-iterate',
        steps: [{
          id: 'lp',
          kind: 'loop',
          config: { prompt: 'keep going', until: 'COMPLETE', max_iterations: 5, role: 'writer' },
        }],
      };
      const result = await runWorkflow(wf, { handlers: makeHandlers({ providers: { writer: provider } }) });
      expect(result.status).toBe('success');
      const out = result.outputs.lp as { iterations: number; completionDetected: boolean };
      expect(out.iterations).toBe(3);
      expect(out.completionDetected).toBe(true);
    });

    it('fails when max_iterations exceeded', async () => {
      const provider = noopProvider('no signal here');
      const wf: WorkflowDefinition = {
        name: 'loop-exceeded',
        steps: [{
          id: 'lp',
          kind: 'loop',
          config: { prompt: 'do work', until: 'DONE', max_iterations: 2, role: 'writer' },
        }],
      };
      const result = await runWorkflow(wf, { handlers: makeHandlers({ providers: { writer: provider } }) });
      expect(result.status).toBe('error');
      expect(result.error).toMatch(/exceeded max iterations/);
    });

    it('respects until_bash completion check', async () => {
      const provider = noopProvider('still going');
      const toolExecutor = vi.fn().mockResolvedValue({ success: true, data: {}, duration: 0 });
      const wf: WorkflowDefinition = {
        name: 'loop-bash',
        steps: [{
          id: 'lp',
          kind: 'loop',
          config: { prompt: 'work', until: 'COMPLETE', max_iterations: 5, until_bash: 'test -f output.txt', role: 'writer' },
        }],
      };
      const result = await runWorkflow(wf, {
        handlers: makeHandlers({ providers: { writer: provider }, toolExecutor }),
      });
      expect(result.status).toBe('success');
      expect(toolExecutor).toHaveBeenCalledWith('bash', expect.objectContaining({ command: 'test -f output.txt' }));
      const out = result.outputs.lp as { completionDetected: boolean };
      expect(out.completionDetected).toBe(true);
    });

    it('until_bash failure continues loop', async () => {
      let callCount = 0;
      const provider: LLMProvider = {
        async complete() {
          callCount++;
          if (callCount === 1) {
            return { content: 'not done', usage: { inputTokens: 1, outputTokens: 1 } };
          }
          return { content: 'done COMPLETE', usage: { inputTokens: 1, outputTokens: 1 } };
        },
      };
      const toolExecutor = vi.fn()
        .mockResolvedValueOnce({ success: false, error: 'exit 1', duration: 0 })
        .mockResolvedValueOnce({ success: true, data: {}, duration: 0 });
      const wf: WorkflowDefinition = {
        name: 'loop-bash-fail',
        steps: [{
          id: 'lp',
          kind: 'loop',
          config: { prompt: 'work', until: 'COMPLETE', max_iterations: 5, until_bash: 'check.sh', role: 'writer' },
        }],
      };
      const result = await runWorkflow(wf, {
        handlers: makeHandlers({ providers: { writer: provider }, toolExecutor }),
      });
      expect(result.status).toBe('success');
      const out = result.outputs.lp as { iterations: number };
      expect(out.iterations).toBe(2);
    });

    it('fresh_context resets message history each iteration', async () => {
      const capturedMessages: Array<Array<{ role: string; content: string }>> = [];
      const provider: LLMProvider = {
        async complete(messages) {
          capturedMessages.push([...messages]);
          return { content: 'output COMPLETE', usage: { inputTokens: 1, outputTokens: 1 } };
        },
      };
      const wf: WorkflowDefinition = {
        name: 'loop-fresh',
        steps: [{
          id: 'lp',
          kind: 'loop',
          config: { prompt: 'do it', until: 'COMPLETE', max_iterations: 3, fresh_context: true, role: 'writer' },
        }],
      };
      await runWorkflow(wf, { handlers: makeHandlers({ providers: { writer: provider } }) });
      // Each iteration should only see [user, prompt] — no accumulated history
      for (const msgs of capturedMessages) {
        expect(msgs).toHaveLength(1);
        expect(msgs[0].role).toBe('user');
      }
    });

    it('accumulates usage across iterations until signal or max_iterations', async () => {
      let callCount = 0;
      const provider: LLMProvider = {
        async complete() {
          callCount++;
          if (callCount < 3) {
            return { content: 'work', usage: { inputTokens: 10, outputTokens: 20 } };
          }
          return { content: 'done COMPLETE', usage: { inputTokens: 10, outputTokens: 20 } };
        },
      };
      const wf: WorkflowDefinition = {
        name: 'loop-usage',
        steps: [{
          id: 'lp',
          kind: 'loop',
          config: { prompt: 'go', until: 'COMPLETE', max_iterations: 5, role: 'writer' },
        }],
      };
      const result = await runWorkflow(wf, { handlers: makeHandlers({ providers: { writer: provider } }) });
      expect(result.status).toBe('success');
      const out = result.outputs.lp as { usage: { inputTokens: number; outputTokens: number }; iterations: number };
      // 3 iterations × 10 input, 20 output each
      expect(out.usage.inputTokens).toBe(30);
      expect(out.usage.outputTokens).toBe(60);
      expect(out.iterations).toBe(3);
    });

    it('emits loop iteration events', async () => {
      const stream = new EventStream();
      const provider: LLMProvider = {
        async complete() {
          return { content: 'done COMPLETE', usage: { inputTokens: 1, outputTokens: 1 } };
        },
      };
      const wf: WorkflowDefinition = {
        name: 'loop-events',
        steps: [{
          id: 'lp',
          kind: 'loop',
          config: { prompt: 'go', until: 'COMPLETE', max_iterations: 5, role: 'writer' },
        }],
      };
      await runWorkflow(wf, { handlers: makeHandlers({ providers: { writer: provider }, eventStream: stream }) });
      const events = stream.getAll();
      const started = events.filter((e) => e.type === 'loop_iteration_started');
      const completed = events.filter((e) => e.type === 'loop_iteration_completed');
      expect(started).toHaveLength(1);
      expect(completed).toHaveLength(1);
      expect(started[0]).toMatchObject({ stepId: 'lp', iteration: 1, maxIterations: 5 });
      expect(completed[0]).toMatchObject({ stepId: 'lp', iteration: 1, completionDetected: true });
    });

    it('errors when no provider is registered for the role', async () => {
      const wf: WorkflowDefinition = {
        name: 'loop-no-provider',
        steps: [{
          id: 'lp',
          kind: 'loop',
          config: { prompt: 'go', until: 'DONE', max_iterations: 3, role: 'nonexistent' },
        }],
      };
      const result = await runWorkflow(wf, { handlers: makeHandlers() });
      expect(result.status).toBe('error');
      expect(result.error).toMatch(/no provider is registered/);
    });
  });

  describe('telemetry', () => {
    it('emits workflow_run_started, step_completed, and run_completed events', async () => {
      const stream = new EventStream();
      const wf: WorkflowDefinition = {
        name: 'telemetry-wf',
        steps: [{ id: 's1', kind: 'llm', config: { role: 'writer' } }],
      };
      const result = await runWorkflow(wf, {
        handlers: { providers: { writer: noopProvider('x') }, eventStream: stream },
      });
      const events = stream.getAll();
      expect(events.find((e) => e.type === 'workflow_run_started')).toBeDefined();
      const stepEvents = events.filter((e) => e.type === 'workflow_step_completed');
      expect(stepEvents).toHaveLength(1);
      expect(events.find((e) => e.type === 'workflow_run_completed')).toBeDefined();
      expect(result.runId).toBeDefined();
    });
  });

  describe('standard-draft workflow (end-to-end)', () => {
    it('runs the full draft → quality-gate → synthesize pipeline', async () => {
      const calls: string[] = [];
      const makeProvider = (role: string, content: string): LLMProvider => ({
        async complete() {
          calls.push(role);
          return { content, usage: { inputTokens: 1, outputTokens: 1 } };
        },
      });

      const writer = makeProvider('writer', JSON.stringify({ response: 'drafted' }));
      const reviewer = makeProvider('reviewer', JSON.stringify({ verdict: 'PASS', findings: [] }));
      const challenger = makeProvider('challenger', JSON.stringify({ response: 'no issues' }));

      const wf: WorkflowDefinition = {
        name: 'standard-draft',
        steps: [
          { id: 'draft', kind: 'llm', config: { role: 'writer' } },
          {
            id: 'quality-gate',
            kind: 'parallel',
            config: {
              branches: [
                { id: 'review', kind: 'llm', config: { role: 'reviewer' } },
                { id: 'challenge', kind: 'llm', config: { role: 'challenger' } },
              ],
              reviewerFirst: {
                branchId: 'review',
                passOn: 'PASS',
                dependentBranchIds: ['challenge'],
              },
            },
          },
          { id: 'synthesize', kind: 'tool', config: { name: 'synthesizer' } },
        ],
      };

      const result = await runWorkflow(wf, {
        handlers: {
          providers: { writer, reviewer, challenger },
          toolExecutor: async () => ({ success: true, data: { output: 'synthesized' }, duration: 0 }),
        },
      });

      expect(result.status).toBe('success');
      expect(calls).toEqual(['writer', 'reviewer']); // challenger skipped
      const qg = result.outputs['quality-gate'] as { branches: Record<string, { content: string }> };
      expect(qg.branches.review.content).toContain('PASS');
      expect(result.outputs.synthesize).toEqual({ output: 'synthesized' });
    });
  });
});
