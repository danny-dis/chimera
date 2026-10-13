import { afterEach, expect, it, vi } from 'vitest';
import { EventStream } from '@chimera/core';
import { CliRouter } from '../cli-router.js';
vi.mock('../config-loader.js', async original => ({ ...await original<typeof import('../config-loader.js')>(), configExists: () => true, loadConfig: () => ({ providers: [] }) }));
vi.mock('@chimera/learning', async original => ({ ...await original<typeof import('@chimera/learning')>(), resolveActiveStyle: vi.fn(async () => undefined) }));
const priorExit = process.exitCode;
afterEach(() => { process.exitCode = priorExit; vi.restoreAllMocks(); });
it.each(['ask', 'plan', 'review'])('forwards command-local JSON options for %s', async mode => {
  const router = new CliRouter() as any;
  vi.spyOn(router, 'initializeRuntime').mockImplementation(() => {});
  const run = vi.spyOn(router, 'run').mockResolvedValue(undefined);
  router.program.exitOverride();
  for (const command of router.program.commands) command.exitOverride();
  await router.runCli(['node', 'chimera', mode, 'inspect code', '--json']);
  expect(run).toHaveBeenCalledWith(mode, 'inspect code', 'solo', [], expect.objectContaining({ json: true }));
});
it('reserves stdout for a single JSON result while sending tool progress to stderr', async () => {
  const router = new CliRouter() as any;
  const provider = { getModel: () => ({ provider: 'configured', id: 'test' }), complete: vi.fn(), getCost: () => 0 };
  vi.spyOn(router, 'getRoleMappedProviders').mockResolvedValue({ writer: provider, reviewer: provider, fallback: [provider] });
  const stream = new EventStream();
  const expected = { status: 'done', output: 'done', cost: 0, agentCount: 1 };
  const execute = vi.fn(async () => {
    stream.append({ type: 'tool_call_requested', call: { tool: 'write_file', args: { path: 'sum.js' } }, policy: 'allow' } as any);
    stream.append({ type: 'tool_call_result', result: { tool: 'write_file', exitCode: 0,
      diffs: [{ path: 'sum.js', additions: 1, deletions: 0, unchanged: false }] } } as any);
    return expected;
  });
  vi.spyOn(router, 'buildRunContext').mockResolvedValue({ orchestrator: { execute, dispose: vi.fn(), getEventStream: () => stream } });
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
  await router.run('code', 'repair sum.js', 'solo', ['node verify.cjs'], { json: true, verifyOutput: ['dist'] });
  expect(log).not.toHaveBeenCalled();
  expect(stdout).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(stdout.mock.calls[0][0]))).toEqual(expected);
  expect(stderr.mock.calls.flat().join('\n')).toContain('[tool]');
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ verificationOutputs: ['dist'] }));
});
