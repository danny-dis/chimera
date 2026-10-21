import { afterEach, expect, it, vi } from 'vitest';
import { CliRouter } from '../cli-router.js';
const prior = process.exitCode;
afterEach(() => { process.exitCode = prior; vi.restoreAllMocks(); });
it('resuming a completed session never executes its task again', async () => {
  const router = new CliRouter() as any;
  vi.spyOn(router, 'initializeRuntime').mockImplementation(() => {});
  router.sessionStore = { load: vi.fn(async () => ({ task: 'non-idempotent action', mode: 'code', metadata: { status: 'completed' } })) };
  const run = vi.spyOn(router, 'run').mockResolvedValue(undefined);
  const initialize = vi.spyOn(router, 'initOrchestrator').mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await router.runCli(['node', 'chimera', 'resume', 'completed-fixture']);
  expect(run).not.toHaveBeenCalled();
  expect(initialize).not.toHaveBeenCalled();
});
