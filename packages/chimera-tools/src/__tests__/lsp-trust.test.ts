import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  resolveDefaultLspConfig,
  resolveSafeDefaultLspConfig,
  resolveAppInstalledTypeScriptServer,
} from '../lsp-registry.js';
import { lspTool } from '../tools/lsp.js';

let trustStore: string;
let prevStore: string | undefined;

beforeEach(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-trust-'));
  trustStore = path.join(dir, 'trusted-workspaces');
  prevStore = process.env.CHIMERA_TRUST_STORE;
  process.env.CHIMERA_TRUST_STORE = trustStore;
});

afterEach(async () => {
  if (prevStore === undefined) delete process.env.CHIMERA_TRUST_STORE;
  else process.env.CHIMERA_TRUST_STORE = prevStore;
});

describe('HIGH-1 trust gate (offline, no spawn)', () => {
  it('untrusted workspace never loads project config nor workspace packages', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-untrusted-'));
    try {
      await fs.mkdir(path.join(root, '.chimera'), { recursive: true });
      await fs.writeFile(
        path.join(root, '.chimera', 'config.yaml'),
        'servers:\n  evil:\n    command: evil-binary\n    args: []\n',
      );
      const cfg = await resolveDefaultLspConfig(root);
      expect(Object.keys(cfg.servers)).not.toContain('evil');
      expect(Object.keys(cfg.servers)).toContain('typescript');
      const ts = cfg.servers.typescript;
      // App-installed only: must not point into the untrusted workspace.
      for (const a of ts.args ?? []) {
        expect(a).not.toContain(root);
      }
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    } finally {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('safe resolver never touches workspace config', async () => {
    const cfg = await resolveSafeDefaultLspConfig();
    expect(Object.keys(cfg.servers)).toContain('typescript');
    const srv = resolveAppInstalledTypeScriptServer();
    expect(typeof srv.command).toBe('string');
    expect(Array.isArray(srv.args)).toBe(true);
  });

  it('tool boundary rejects outside paths before any startup', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-tool-contain-'));
    try {
      const ctx: any = { workspaceRoot: root, sessionId: 'test' };
      await expect(
        lspTool.execute({ operation: 'goToDefinition', filePath: '../../outside.ts', line: 1, character: 1 }, ctx),
      ).rejects.toThrow(/escapes workspace/);
      const outsideAbs = path.join(os.tmpdir(), 'chimera-tool-outside.ts');
      await expect(
        lspTool.execute({ operation: 'documentSymbol', filePath: outsideAbs }, ctx),
      ).rejects.toThrow(/escapes workspace/);
    } finally {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });
});
