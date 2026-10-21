import { expect, it } from 'vitest';
import { buildSyntheticTrajectory } from '../eval-runner.js';
it('labels synthetic data and records no invented provider calls or measurements', () => {
  const trajectory = buildSyntheticTrajectory({ id: 'fixture', description: 'not executed' }, 'code');
  expect(trajectory.config).toMatchObject({ real: false, synthetic: true, tokensMeasured: false });
  expect(trajectory.totalCost).toBe(0);
  expect(trajectory.totalTokens).toEqual({ input: 0, output: 0 });
  expect(trajectory.duration).toBe(0);
  expect(trajectory.steps.some(step => step.type === 'agent_call')).toBe(false);
  expect(trajectory.finalOutput).toContain('[SYNTHETIC]');
  expect(trajectory.steps.find(step => step.type === 'check')?.output).toMatchObject({ pass: false });
});
