import { afterEach, expect, it, vi } from 'vitest';
import { CliRouter } from '../cli-router.js';

afterEach(() => vi.restoreAllMocks());
it('retains a shared goal context until cancelled execution settles', async () => {
  const router = new CliRouter() as any;
  const controller = new AbortController();
  const provider = { complete: vi.fn(), getModel: () => ({ provider: 'configured' }) };
  vi.spyOn(router, 'getRoleMappedProviders').mockResolvedValue({ writer: provider, reviewer: provider, fallback: [provider] });
  let release!: (value: unknown) => void;
  const execute = vi.fn(() => new Promise(resolve => { release = resolve; }));
  const dispose = vi.fn();
  let settled = false;
  const checked = router.executeGoal('work', [], { context: { orchestrator: { execute, dispose } }, signal: controller.signal })
    .then(() => { settled = true; }, (error: Error) => { settled = true; expect(error.message).toBe('cancelled'); });
  try {
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    controller.abort(new Error('cancelled'));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    expect(dispose).not.toHaveBeenCalled();
  } finally {
    release({ status: 'done', output: 'late', cost: 0, agentCount: 1 });
    await checked;
  }
  expect(settled).toBe(true);
});
