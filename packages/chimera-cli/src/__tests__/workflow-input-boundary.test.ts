import { afterEach, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { registerWorkflowCommand } from '../commands/workflow.js';
const exitCode = process.exitCode;
afterEach(() => { process.exitCode = exitCode; vi.restoreAllMocks(); });
it.each(['null', '1', 'true', '"task"', '[]'])('rejects non-object workflow input %s before execution', async value => {
  const execute = vi.fn();
  const parent = new Command();
  registerWorkflowCommand(parent, execute);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await parent.parseAsync(['node', 'chimera', 'workflow', 'run', 'standard-draft', '--input', value]);
  expect(execute).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
});
