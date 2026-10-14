import { afterEach, expect, it, vi } from 'vitest';
import { CliRouter } from '../cli-router.js';
afterEach(() => vi.restoreAllMocks());
it('reuses the supplied UI context and honors caller cancellation without disposing it', async () => {
  const router = new CliRouter() as any;
  const controller = new AbortController();
  const provider = { complete: vi.fn(), getModel: () => ({ provider: 'configured' }) };
  vi.spyOn(router, 'getRoleMappedProviders').mockResolvedValue({ writer: provider, reviewer: provider, fallback: [provider] });
  const build = vi.spyOn(router, 'buildRunContext').mockRejectedValue(new Error('Unexpected second context'));
  const dispose = vi.fn();
  let signal!: AbortSignal;
  const execute = vi.fn(async (options: any) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const context = { orchestrator: { execute, dispose } };
  const run = router.executeGoal('verify caller task', [], { context, signal: controller.signal, mode: 'debug', preset: 'trio' });
  const checked = run.catch((error: Error) => error);
  await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ mode: 'debug', preset: 'trio', signal: expect.any(AbortSignal) }));
  controller.abort(new Error('User cancelled'));
  expect((await checked).message).toBe('User cancelled');
  expect(build).not.toHaveBeenCalled();
  expect(dispose).not.toHaveBeenCalled();
  expect(signal.aborted).toBe(true);
});
