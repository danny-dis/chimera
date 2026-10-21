import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ starts: 0, disposals: 0, failDispose: false, release: undefined as undefined | (() => void) }));
vi.mock('@chimera/lsp', async original => ({
  ...await original<typeof import('@chimera/lsp')>(),
  ChimeraLspService: class {
    async start() { state.starts++; await new Promise<void>(resolve => { state.release = resolve; }); }
    async dispose() { state.disposals++; if (state.failDispose) throw new Error('cleanup failed'); }
  },
}));
vi.mock('../hooks/trust.js', () => ({ isWorkspaceTrusted: async () => false }));
import { getOrCreateLspService, disposeAllLspServices } from '../lsp-registry.js';

afterEach(async () => { state.failDispose = false; state.release?.(); await disposeAllLspServices(); state.starts = 0; state.disposals = 0; state.release = undefined; });

it('shares startup between concurrent callers', async () => {
  const calls = [getOrCreateLspService('registry-concurrent'), getOrCreateLspService('registry-concurrent')];
  await vi.waitFor(() => expect(state.release).toBeTypeOf('function'));
  state.release!();
  const [a, b] = await Promise.all(calls);
  expect(a).toBe(b); expect(state.starts).toBe(1);
});

it('does not cache or leak a service initialized after registry disposal', async () => {
  const call = getOrCreateLspService('registry-disposal');
  const checked = expect(call).rejects.toThrow(/disposed/i);
  await vi.waitFor(() => expect(state.starts).toBe(1));
  const disposed = disposeAllLspServices();
  const lookup = getOrCreateLspService('registry-disposal');
  const blocked = expect(lookup).rejects.toThrow(/dispos/i);
  state.release!(); await blocked;
  await checked; await disposed;
  expect(state.disposals).toBe(1);
});

it('does not return a disposed cached service after failed cleanup', async () => {
  const call = getOrCreateLspService('registry-cached-cleanup-failure');
  await vi.waitFor(() => expect(state.starts).toBe(1)); state.release!(); await call;
  state.failDispose = true;
  await expect(disposeAllLspServices()).rejects.toThrow(/shutdown failed/);
  await expect(getOrCreateLspService('registry-cached-cleanup-failure')).rejects.toThrow(/cleanup|dispos/i);
  const attempts = state.disposals;
  state.failDispose = false; await disposeAllLspServices();
  expect(state.disposals).toBeGreaterThan(attempts);
});

it('retains an invalidated startup when cleanup fails and retries on disposal', async () => {
  const call = getOrCreateLspService('registry-cleanup-failure');
  const checked = expect(call).rejects.toThrow(/cleanup failed/);
  await vi.waitFor(() => expect(state.starts).toBe(1));
  state.failDispose = true;
  const disposed = disposeAllLspServices();
  const rejected = expect(disposed).rejects.toThrow(/shutdown failed/);
  state.release!(); await checked; await rejected;
  let blocked = false;
  const retried = getOrCreateLspService('registry-cleanup-failure').then(() => {}, () => { blocked = true; });
  try { await vi.waitFor(() => expect(blocked).toBe(true), { timeout: 200 }); }
  finally { state.failDispose = false; state.release!(); await retried; }
  const attempts = state.disposals;
  state.failDispose = false; await disposeAllLspServices();
  expect(state.disposals).toBeGreaterThan(attempts);
});
