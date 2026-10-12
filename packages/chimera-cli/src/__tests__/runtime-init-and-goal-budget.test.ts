import { afterEach, describe, expect, it, vi } from 'vitest';
import { CliRouter } from '../cli-router.js';

vi.mock('@chimera/session', () => ({
  CheckpointStore: class { list = vi.fn(async () => []); },
}));
vi.mock('@chimera/learning', async (original) => ({
  ...await original<typeof import('@chimera/learning')>(),
  LearningEngine: class {},
}));
vi.mock('@chimera/core', async (original) => ({
  ...await original<typeof import('@chimera/core')>(),
  MemoryPersistence: class { getMemory() { return {}; } },
}));

afterEach(() => vi.restoreAllMocks());

describe('runtime initialization and goal budget', () => {
  it('initializes once before subcommand actions with global options', async () => {
    const router = new CliRouter();
    const runtime = router as any;
    expect(runtime._runtimeInitialized).toBe(false);
    await router.runCli(['node', 'chimera', '--no-learn', '-v', '--mode', 'code', 'sessions']);
    expect(runtime._runtimeInitialized).toBe(true);
    const store = runtime.sessionStore;
    expect(store.list).toHaveBeenCalledOnce();
    await router.runCli(['node', 'chimera', 'sessions']);
    expect(runtime.sessionStore).toBe(store);
    expect(store.list).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['--help'], ['--version'], ['ask', '--help'], ['--mode', 'rpc', '--help'],
  ])('does not initialize for informational arguments %j', async (...args) => {
    const router = new CliRouter();
    const runtime = router as any;
    runtime.program.exitOverride().configureOutput({ writeOut: () => {} });
    for (const command of runtime.program.commands) command.exitOverride();
    await expect(router.runCli(['node', 'chimera', ...args])).rejects.toMatchObject({ exitCode: 0 });
    expect(runtime._runtimeInitialized).toBe(false);
  });

  it('shares twenty calls across roles, preserves pricing, and fails even if the error is caught', async () => {
    const router = new CliRouter();
    const runtime = router as any;
    const complete = vi.fn(async () => ({ content: 'ok', usage: { inputTokens: 1, outputTokens: 1 } }));
    const getCost = vi.fn(() => 0.5);
    const getPricing = vi.fn(() => ({ inputPerMillion: 1, outputPerMillion: 2 }));
    const provider = { complete, getCost, getPricing, getModel: () => ({ provider: 'configured' }) };
    const dispose = vi.fn();
    const execute = vi.fn(async ({ providers }) => {
      expect(providers.writer.getCost()).toBe(0.5);
      expect(providers.reviewer.getPricing()).toEqual({ inputPerMillion: 1, outputPerMillion: 2 });
      for (let i = 0; i < 20; i++) {
        await (i % 2 ? providers.reviewer : providers.writer).complete([]);
      }
      await expect(providers.reviewer.complete([])).rejects.toThrow('Goal provider call limit of 20 exceeded.');
      return { status: 'done', cost: 0, output: 'ok', agentCount: 1 };
    });
    vi.spyOn(runtime, 'buildRunContext').mockResolvedValue({ orchestrator: { execute, dispose } });
    vi.spyOn(runtime, 'getRoleMappedProviders').mockResolvedValue({ writer: provider, reviewer: provider, fallback: [provider] });
    await expect(runtime.executeGoal('test goal')).rejects.toThrow('Goal provider call limit of 20 exceeded.');
    expect(complete).toHaveBeenCalledTimes(20);
    expect(execute).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });
});