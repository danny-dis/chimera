import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ start: vi.fn(async () => {}), dispose: vi.fn(async () => {}) }));
vi.mock('@chimera/lsp', async original => ({
  ...await original<typeof import('@chimera/lsp')>(),
  ChimeraLspService: class {
    start = state.start;
    dispose = state.dispose;
    documentSymbols = async () => [];
  },
}));
import { lspTool } from '../tools/lsp.js';
import { disposeAllLspServices } from '../lsp-registry.js';
import path from 'node:path';
afterEach(async () => { await disposeAllLspServices(); vi.clearAllMocks(); });
it('tracks non-workspace-symbol startup before concurrent disposal', async () => {
  const pending = lspTool.execute({ operation: 'documentSymbol', filePath: path.join(process.cwd(), 'fixture.ts') }, { workspaceRoot: process.cwd() } as any);
  const outcome = pending.then(value => ({ value }), error => ({ error }));
  await disposeAllLspServices();
  const result = await outcome;
  expect(result).toHaveProperty('error');
  expect(state.dispose).toHaveBeenCalledOnce();
});
