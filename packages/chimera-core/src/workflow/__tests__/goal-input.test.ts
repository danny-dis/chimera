import { expect, it } from 'vitest';
import { parseGoalInput } from '../goal-input.js';

it('preserves repeated quoted verification commands and strips them from the goal', () => {
  expect(parseGoalInput('fix auth --verify "pnpm test --run" --verify \'node --check auth.js\''))
    .toEqual({ task: 'fix auth', verificationCommands: ['pnpm test --run', 'node --check auth.js'] });
  expect(parseGoalInput('fix auth')).toEqual({ task: 'fix auth', verificationCommands: [] });
});

it.each(['fix --verify', 'fix --verify "unfinished', 'fix --verify ""'])('rejects malformed verification: %s', input => {
  expect(() => parseGoalInput(input)).toThrow(/--verify/);
});
