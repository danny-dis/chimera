import { afterEach, expect, it, vi } from 'vitest';
import { CliRouter } from '../cli-router.js';
afterEach(() => vi.restoreAllMocks());
it.each([false, true])('forwards explicit goal yolo=%s into the canonical tool context', async (yolo) => {
  const router = new CliRouter() as any;
  router.program.setOptionValue('yolo', yolo);
  const provider = { complete: vi.fn(), getModel: () => ({ provider: 'configured' }) };
  const build = vi.spyOn(router, 'buildRunContext').mockResolvedValue({ orchestrator: { execute: vi.fn(async () => ({ status: 'done', cost: 0 })), dispose: vi.fn() } });
  vi.spyOn(router, 'getRoleMappedProviders').mockResolvedValue({ writer: provider, reviewer: provider, fallback: [provider] });
  await router.executeGoal('run caller verification');
  expect(build).toHaveBeenCalledWith('code', expect.objectContaining({ yolo }));
});
it.each(['hung', 'late'])('retains a %s goal until settlement and rejects cancelled output', async (kind) => {
  const controller = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  const router = new CliRouter() as any;
  const dispose = vi.fn();
  let release!: (value: any) => void;
  const execute = vi.fn(() => new Promise(resolve => { release = resolve; }));
  const provider = { complete: vi.fn(), getModel: () => ({ provider: 'configured' }) };
  vi.spyOn(router, 'buildRunContext').mockResolvedValue({ orchestrator: { execute, dispose } });
  vi.spyOn(router, 'getRoleMappedProviders').mockResolvedValue({ writer: provider, reviewer: provider, fallback: [provider] });
  const run = router.executeGoal('create a feature');
  let outcome: unknown;
  const checked = run.then(() => { outcome = 'accepted'; }, (error: unknown) => { outcome = error; });
  try {
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    controller.abort(new Error('goal timeout'));
    if (kind === 'hung') {
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(outcome).toBeUndefined();
      expect(dispose).not.toHaveBeenCalled();
    }
    release({ status: 'done', output: 'late', cost: 0, agentCount: 1 });
    await vi.waitFor(() => expect(outcome).toBeInstanceOf(Error), { timeout: 200 });
    await checked;
    expect((outcome as Error).message).toBe('goal timeout');
    expect(dispose).toHaveBeenCalledOnce();
  } finally { release({ status: 'done', cost: 0 }); await checked; }
});
