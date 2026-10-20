import { afterEach, expect, it, vi } from 'vitest';
import { CliRouter } from '../cli-router.js';
afterEach(() => vi.restoreAllMocks());
function setup(execute: (...args: any[]) => any) {
  const runtime = new CliRouter() as any;
  const provider = { complete: vi.fn(async () => ({ content: 'ok', usage: { inputTokens: 1, outputTokens: 1 } })), getModel: () => ({ provider: 'configured' }) };
  const dispose = vi.fn();
  vi.spyOn(runtime, 'buildRunContext').mockResolvedValue({ orchestrator: { execute, dispose } });
  vi.spyOn(runtime, 'getRoleMappedProviders').mockResolvedValue({ writer: provider, reviewer: provider, challenger: provider, fallback: [provider] });
  return { runtime, provider, dispose };
}
it('forwards explicit task limits and bounds every role', async () => {
  const execute = vi.fn(async (params) => {
    expect(params.timeoutMs).toBe(90000); expect(params.maxToolRounds).toBe(80); expect(params.preset).toBe('trio');
    expect(params.verificationInputs).toEqual(['verify.cjs']); expect(params.verificationOutputs).toEqual(['coverage']);
    await params.providers.writer.complete([]); await params.providers.reviewer.complete([]); await params.providers.challenger.complete([]);
    return { status: 'done', cost: 0, output: 'ok', agentCount: 3 };
  });
  const { runtime, provider, dispose } = setup(execute);
  await runtime.executeGoal('task', [], { timeoutMs: 90000, maxToolRounds: 80, maxProviderCalls: 40, preset: 'trio', verificationInputs: ['verify.cjs'], verificationOutputs: ['coverage'] });
  expect(provider.complete).toHaveBeenCalledTimes(3); expect(dispose).toHaveBeenCalledOnce();
});
it('does not let a swallowed custom provider-call limit become success', async () => {
  const { runtime, provider, dispose } = setup(async ({ providers }) => {
    for (let i = 0; i < 30; i++) await providers.writer.complete([]);
    await expect(providers.reviewer.complete([])).rejects.toThrow('Goal provider call limit of 30 exceeded.');
    return { status: 'done', cost: 0, output: 'ok', agentCount: 1 };
  });
  await expect(runtime.executeGoal('task', [], { maxProviderCalls: 30 })).rejects.toThrow('Goal provider call limit of 30 exceeded.');
  expect(provider.complete).toHaveBeenCalledTimes(30); expect(dispose).toHaveBeenCalledOnce();
});
it.each([0, 1.5, Infinity, 10001])('rejects invalid call limit %s before creating a runtime', async maxProviderCalls => {
  const { runtime } = setup(async () => ({ status: 'done', cost: 0 }));
  await expect(runtime.executeGoal('task', [], { maxProviderCalls })).rejects.toThrow('maxProviderCalls');
  expect(runtime.buildRunContext).not.toHaveBeenCalled();
});
it('settles the goal deadline when a provider ignores cancellation', async () => {
  const { runtime, provider, dispose } = setup(async ({ providers }) => {
    await providers.writer.complete([]);
    return { status: 'done', cost: 0, output: 'late', agentCount: 1 };
  });
  provider.complete.mockImplementation(() => new Promise(() => {}));
  const outcome = await Promise.race([
    runtime.executeGoal('task', [], { timeoutMs: 25 }).then(() => 'resolved', (error: Error) => error.name),
    new Promise(resolve => setTimeout(() => resolve('still pending'), 250)),
  ]);
  expect(outcome).toBe('TimeoutError');
  expect(dispose).toHaveBeenCalledOnce();
});
it('registers the long-goal CLI options without starting execution', async () => {
  const runtime = new CliRouter() as any;
  runtime.program.exitOverride().configureOutput({ writeErr: () => {} });
  for (const command of runtime.program.commands) command.exitOverride();
  vi.spyOn(runtime, 'initializeRuntime').mockImplementation(() => {});
  const run = vi.spyOn(runtime, 'runGoal').mockResolvedValue(undefined);
  await expect(runtime.runCli(['node','chimera','goal','task','--timeout-ms','90000','--max-calls','40','--max-tool-rounds','80','--preset','trio','--verify-input','verify.cjs','--verify-output','coverage'])).resolves.toBeUndefined();
  expect(run).toHaveBeenCalledWith('task', [], { timeoutMs: 90000, maxProviderCalls: 40, maxToolRounds: 80, preset: 'trio', verificationInputs: ['verify.cjs'], verificationOutputs: ['coverage'] });
});
