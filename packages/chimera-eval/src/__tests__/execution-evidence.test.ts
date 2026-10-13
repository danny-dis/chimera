import { expect, it } from 'vitest';
import { EvalHarness, type TaskSpec, type Trajectory, type TrajectoryStep } from '../eval-harness.js';

const task: TaskSpec = { id: 'evidence', description: 'Implement addition' };
const response: TrajectoryStep = { timestamp: 1, type: 'response', output: 'Done' };
const verification = { verified: true, bundle: { evidences: [{ type: 'test_result', verdict: 'pass', data: { exitCode: 0 } }] } };
const check = (output: unknown): TrajectoryStep => ({ timestamp: 2, type: 'check', output });
const report = (steps: TrajectoryStep[], spec: TaskSpec = task, overrides: Partial<Trajectory> = {}) => {
  const harness = new EvalHarness();
  harness.registerTask(spec);
  const trajectory: Trajectory = { taskId: spec.id, config: {}, steps, finalOutput: 'Done', totalCost: 0.01, totalTokens: { input: 10, output: 10 }, duration: 100, ...overrides };
  harness.recordTrajectory(trajectory);
  return harness.generateReport('evidence-check');
};

it('does not treat a final response as successful execution', () => {
  expect(report([response]).tasks[0].success).toBe(false);
});
it('does not accept a narrated check pass without a verified evidence bundle', () => {
  expect(report([response, check({ pass: true })]).tasks[0].success).toBe(false);
});
it('accepts an executed zero-exit verifier', () => {
  expect(report([response, check({ pass: true, verification })]).tasks[0].success).toBe(true);
});
it('requires evidence for every declared expected file', () => {
  expect(report([response, check({ pass: true, verification })], { ...task, expectedFiles: ['sum.js'] }).tasks[0].success).toBe(false);
});
it('does not infer natural-language acceptance criteria from a response', () => {
  expect(report([response, check({ pass: true, verification })], { ...task, acceptanceCriteria: ['works correctly'] }).tasks[0].success).toBe(false);
});
it('rejects a failed check even if it has no error string', () => {
  expect(report([response, check({ pass: false, verification })]).tasks[0].success).toBe(false);
});
it('does not fabricate cost savings without a comparison baseline', () => {
  expect(report([response, check({ pass: true, verification })]).summary.costSavingsVsFrontier).toBeNull();
});
it('enforces a caller token limit from recorded usage', () => {
  expect(report([response, check({ pass: true, verification })], { ...task, maxTokens: 5 }).tasks[0].success).toBe(false);
});
it.each([
  { input: -100, output: 10 }, { input: NaN, output: 10 },
  { input: 5, output: undefined }, { input: Infinity, output: 0 },
])('rejects invalid recorded token usage %j', totalTokens => {
  expect(report([response, check({ pass: true, verification })], { ...task, maxTokens: 5 }, { totalTokens: totalTokens as any }).tasks[0].success).toBe(false);
});
it('rejects malformed evidence entries instead of throwing or ignoring them', () => {
  const malformed = { verified: true, bundle: { evidences: [null, verification.bundle.evidences[0]] } };
  expect(report([response, check({ pass: true, verification: malformed })]).tasks[0].success).toBe(false);
});
