import { afterEach, expect, it, vi } from 'vitest';
import { EventStream } from '@chimera/core';
import { CliRouter } from '../cli-router.js';

vi.mock('../config-loader.js', async original => ({
  ...await original<typeof import('../config-loader.js')>(), configExists: () => true, loadConfig: () => ({ providers: [] }),
}));
vi.mock('@chimera/learning', async original => ({
  ...await original<typeof import('@chimera/learning')>(), resolveActiveStyle: vi.fn(async () => undefined),
}));

const priorExit = process.exitCode;
afterEach(() => { process.exitCode = priorExit; vi.restoreAllMocks(); });

it.each(['code', 'debug', 'oal'])('forwards repeated caller verification from the %s command', async mode => {
  const router = new CliRouter();
  const runtime = router as any;
  vi.spyOn(runtime, 'initializeRuntime').mockImplementation(() => {});
  const run = vi.spyOn(runtime, 'run').mockResolvedValue(undefined);
  runtime.program.exitOverride();
  for (const command of runtime.program.commands) command.exitOverride();
  await router.runCli(['node', 'chimera', mode, 'repair sum.js', '--verify', 'node verify.cjs', '--verify', 'node --check sum.js']);
  expect(run).toHaveBeenCalledWith(mode, 'repair sum.js', 'solo', ['node verify.cjs', 'node --check sum.js'], expect.any(Object));
});

it.each(['done', 'needs_user', 'blocked', 'error'])('uses caller evidence and truthful process status for %s', async status => {
  const router = new CliRouter();
  const runtime = router as any;
  const provider = { getModel: () => ({ provider: 'configured', id: 'test' }), complete: vi.fn(), getCost: () => 0 };
  vi.spyOn(runtime, 'getRoleMappedProviders').mockResolvedValue({ writer: provider, reviewer: provider, fallback: [provider] });
  const execute = vi.fn(async () => ({ status, output: 'test result', cost: 0, agentCount: 1 }));
  const dispose = vi.fn();
  const stream = new EventStream();
  vi.spyOn(runtime, 'buildRunContext').mockResolvedValue({ orchestrator: { execute, dispose, getEventStream: () => stream } });
  vi.spyOn(runtime, 'printResult').mockImplementation(() => {});
  const commands = ['node verify.cjs'];
  await runtime.run('code', 'repair sum.js', 'solo', commands);
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ verificationCommands: commands }));
  expect(dispose).toHaveBeenCalledOnce();
  expect(process.exitCode).toBe(status === 'done' ? priorExit : 1);
});

it('routes public parallel coding through the normal tool-enabled verification path', async () => {
  const router = new CliRouter();
  const runtime = router as any;
  vi.spyOn(runtime, 'initializeRuntime').mockImplementation(() => {});
  const run = vi.spyOn(runtime, 'run').mockResolvedValue(undefined);
  runtime.program.exitOverride();
  for (const command of runtime.program.commands) command.exitOverride();
  await router.runCli(['node', 'chimera', 'parallel', 'repair sum.js', '--verify', 'node verify.cjs']);
  expect(run).toHaveBeenCalledWith('code', 'repair sum.js', 'hive', ['node verify.cjs'], expect.any(Object));
});
