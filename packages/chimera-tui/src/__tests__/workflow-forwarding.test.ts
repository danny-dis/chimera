import { expect, it, vi } from 'vitest';
import { runCommand, type CommandContext } from '../commands/commands.js';
it('dispatches a custom workflow with its raw arguments through the host', async () => {
  const runWorkflow = vi.fn().mockResolvedValue({ status: 'success', output: 'actual steps finished' });
  const result = await runCommand('/my-workflow "a b"   tail', { runWorkflow } as unknown as CommandContext);
  expect(runWorkflow).toHaveBeenCalledWith('my-workflow', '"a b"   tail');
  expect(result.output).toEqual(['Workflow: success', 'actual steps finished']);
});
it('does not disguise an unknown custom workflow as a run', async () => {
  const runWorkflow = vi.fn().mockResolvedValue(null);
  const result = await runCommand('/missing', { runWorkflow } as unknown as CommandContext);
  expect(result.output.join('\n')).toContain('Unknown command');
});
