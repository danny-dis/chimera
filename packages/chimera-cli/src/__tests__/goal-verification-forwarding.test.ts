import { expect, it, vi } from 'vitest';
import { runSlashCommand, type ReplContext } from '../commands/registry.js';

it('forwards quoted goal verification through the normal slash command', async () => {
  const result = { status: 'done', output: 'checked', sessionId: 'goal' };
  const executeGoal = vi.fn().mockResolvedValue(result);
  const printResult = vi.fn();
  const context = { executeGoal, printResult, setLatestReplResult: vi.fn(), setLoopState: vi.fn(), getLoopState: () => null } as unknown as ReplContext;
  expect(await runSlashCommand('goal', [], context, 'repair x.ts --verify "node x.test.cjs" --verify \'node --check x.ts\'')).toBe('continue');
  expect(executeGoal).toHaveBeenCalledWith('repair x.ts', ['node x.test.cjs', 'node --check x.ts']);
  expect(printResult).toHaveBeenCalledWith(result);
});
