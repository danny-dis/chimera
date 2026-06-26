/**
 * LLM judge wiring — verifies that `EvalHarness.scoreTask` consumes the
 * `JudgeVerdict` returned by `judgeTrajectory` (which uses the `sideQuery`
 * channel) and that the resulting `EvalScore` reflects the judge's score
 * instead of the heuristic fallback.
 *
 * The judge is invoked via the `sideQuery` channel. We mock `ModelProvider`
 * with a tiny stub that returns a fixed JSON response so the test stays
 * hermetic and free of network.
 */

import { describe, it, expect, vi } from 'vitest';
import { EvalHarness, judgeTrajectory, formatJudgeScore, sideQuery } from '../index.js';
import type { TaskSpec, Trajectory, JudgeVerdict } from '../index.js';
import type { ModelProvider } from '@chimera/providers';

// Minimal ModelProvider stub. Only `complete()` and `getModel()` are touched
// by the judge path; everything else is a no-op throwaway.
function makeStubJudge(responseContent: string): ModelProvider {
  return {
    async complete() {
      return {
        content: responseContent,
        finishReason: 'stop',
        usage: { inputTokens: 50, outputTokens: 30 },
      };
    },
    async *stream() {
      yield { content: responseContent, finishReason: 'stop' };
    },
    getModel() {
      return { id: 'stub-judge', name: 'Stub Judge', provider: 'stub', contextWindow: 8192, maxOutputTokens: 1024 };
    },
    getContextWindow() { return 8192; },
    getMaxOutputTokens() { return 1024; },
    getCost() { return 0; },
    getPricing() { return { inputPerMillion: 0, outputPerMillion: 0 }; },
    supportsToolCalling() { return false; },
    supportsStructuredOutput() { return true; },
    supportsVision() { return false; },
    supportsReasoning() { return false; },
    countTokens() { return 0; },
    countTokensForMessages() { return 0; },
  };
}

const sampleTask: TaskSpec = {
  id: 'sample-1',
  description: 'add two numbers',
  acceptanceCriteria: ['returns 4 when given 2 and 2'],
};

const sampleTrajectory: Trajectory = {
  taskId: 'sample-1',
  steps: [
    { timestamp: 1, type: 'user_request', input: 'add 2 and 2' },
    { timestamp: 2, type: 'response', output: '4' },
  ],
  finalOutput: '4',
  totalCost: 0.0001,
  totalTokens: { input: 10, output: 5 },
  duration: 50,
  config: {},
};

describe('EvalHarness — LLM judge wiring', () => {
  it('judgeTrajectory calls sideQuery with the trajectory and returns a verdict', async () => {
    const judge = makeStubJudge(
      JSON.stringify({ score: 0.85, confidence: 0.9, rationale: 'correct and concise' }),
    );
    const verdict = await judgeTrajectory(sampleTrajectory, sampleTask, judge);
    expect(verdict.score).toBeCloseTo(0.85, 2);
    expect(verdict.confidence).toBeCloseTo(0.9, 2);
    expect(verdict.rationale).toBe('correct and concise');
    expect(verdict.provider).toBe('stub');
    expect(verdict.model).toBe('stub-judge');
  });

  it('judgeTrajectory tolerates a fenced JSON response from the model', async () => {
    const judge = makeStubJudge(
      '```json\n{"score": 0.7, "confidence": 0.6, "rationale": "ok"}\n```',
    );
    const verdict = await judgeTrajectory(sampleTrajectory, sampleTask, judge);
    expect(verdict.score).toBeCloseTo(0.7, 2);
    expect(verdict.confidence).toBeCloseTo(0.6, 2);
  });

  it('judgeTrajectory clamps scores outside [0, 1]', async () => {
    const judge = makeStubJudge(
      JSON.stringify({ score: 1.7, confidence: -0.2, rationale: 'overrated' }),
    );
    const verdict = await judgeTrajectory(sampleTrajectory, sampleTask, judge);
    expect(verdict.score).toBe(1);
    expect(verdict.confidence).toBe(0);
  });

  it('judgeTrajectory falls back to 0.5 when the response is unparseable', async () => {
    const judge = makeStubJudge('this is not JSON at all');
    const verdict = await judgeTrajectory(sampleTrajectory, sampleTask, judge);
    expect(verdict.score).toBe(0.5);
    expect(verdict.confidence).toBeLessThan(0.5);
  });

  it('scoreTask uses the JudgeVerdict score instead of the heuristic', () => {
    const harness = new EvalHarness();
    harness.registerTask(sampleTask);
    harness.recordTrajectory(sampleTrajectory);
    const verdict: JudgeVerdict = {
      score: 0.42,
      confidence: 0.5,
      rationale: 'partially correct',
      raw: '{"score":0.42}',
      provider: 'stub',
      model: 'stub-judge',
    };
    const score = harness.scoreTask('sample-1', verdict);
    expect(score).not.toBeNull();
    expect(score!.qualityScore).toBeCloseTo(0.42, 2);
    expect(score!.judge).toBe(verdict);
    expect(score!.notes).toContain('42%');
    expect(score!.notes).toContain('partially correct');
  });

  it('scoreTask without a verdict uses the heuristic (legacy path)', () => {
    const harness = new EvalHarness();
    harness.registerTask(sampleTask);
    harness.recordTrajectory(sampleTrajectory);
    const score = harness.scoreTask('sample-1');
    expect(score).not.toBeNull();
    // The trajectory has a user_request + response step, no patch, no check,
    // no tool calls, and no errors. Heuristic: base 0.5 + 0 (no patch) +
    // 0 (no check) + 0 (zero tool calls) + 0.1 (zero errors) = 0.6.
    expect(score!.qualityScore).toBeCloseTo(0.6, 2);
    expect(score!.judge).toBeUndefined();
  });

  it('generateReport passes per-task judge verdicts through to scores', () => {
    const harness = new EvalHarness();
    harness.registerTask(sampleTask);
    harness.recordTrajectory(sampleTrajectory);
    const verdict: JudgeVerdict = {
      score: 0.33,
      confidence: 0.4,
      rationale: 'barely',
      raw: '{}',
      provider: 'stub',
      model: 'stub-judge',
    };
    const report = harness.generateReport('run-1', new Map([['sample-1', verdict]]));
    expect(report.tasks).toHaveLength(1);
    expect(report.tasks[0].judge).toBe(verdict);
    expect(report.tasks[0].qualityScore).toBeCloseTo(0.33, 2);
  });

  it('sideQuery is exported and accepts a provider + messages', async () => {
    const judge = makeStubJudge('hello back');
    const out = await sideQuery(judge, [
      { role: 'system', content: 'you are concise' },
      { role: 'user', content: 'hi' },
    ]);
    expect(out).toBe('hello back');
  });

  it('formatJudgeScore produces a human-readable one-liner', () => {
    const verdict: JudgeVerdict = {
      score: 0.8,
      confidence: 0.7,
      rationale: 'looks good',
      raw: '',
      provider: 'anthropic',
      model: 'claude-haiku-3.5',
    };
    const text = formatJudgeScore(verdict);
    expect(text).toContain('80%');
    expect(text).toContain('70%');
    expect(text).toContain('anthropic/claude-haiku-3.5');
    expect(text).toContain('looks good');
  });
});
