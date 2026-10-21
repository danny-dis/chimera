import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ dispose: vi.fn() }));
vi.mock('@chimera/tools', async original => ({
  ...await original<typeof import('@chimera/tools')>(), disposeAllLspServices: state.dispose,
}));
import { CliRouter } from '../cli-router.js';
afterEach(() => { vi.restoreAllMocks(); state.dispose.mockReset(); });

it('waits for LSP shutdown before exiting successfully', async () => {
  let release!: () => void;
  state.dispose.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  const router = new CliRouter() as any;
  const closing = router.exitAfterLspShutdown();
  expect(exit).not.toHaveBeenCalled(); release(); await closing;
  expect(exit).toHaveBeenCalledWith(0);
});
it('reports failed cleanup with nonzero exit', async () => {
  state.dispose.mockRejectedValueOnce(new Error('shutdown failed'));
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  await (new CliRouter() as any).exitAfterLspShutdown();
  expect(exit).toHaveBeenCalledWith(1); expect(log).toHaveBeenCalled();
});
