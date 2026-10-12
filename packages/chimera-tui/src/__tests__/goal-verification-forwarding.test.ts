import { expect, it, vi } from 'vitest';
import { runCommand, type CommandContext } from '../commands/commands.js';

it('forwards quoted goal verification through the normal TUI command', async () => {
  const runTask = vi.fn().mockResolvedValue({ status: 'done', output: 'checked' });
  const context = { runTask } as unknown as CommandContext;
  const result = await runCommand('/goal repair x.ts --verify "node x.test.cjs" --verify \'node --check x.ts\'', context);
  expect(runTask).toHaveBeenCalledWith('repair x.ts', { kind: 'goal', verificationCommands: ['node x.test.cjs', 'node --check x.ts'] });
  expect(result.output).toEqual(['Goal: done', 'checked']);
});
