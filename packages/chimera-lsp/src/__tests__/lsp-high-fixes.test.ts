import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { ChimeraLspService, assertWorkspaceContainment } from '../lsp-service.js';
import type { LspConnection } from '../connection.js';

// FAKE transport — plumbing only, NOT protocol proof.
function fakeConnection(onRequest?: (method: string) => unknown): LspConnection {
  return {
    listen() {},
    async sendRequest<T>(method: string): Promise<T> {
      if (onRequest) return onRequest(method) as T;
      if (method === 'initialize') return { capabilities: {} } as T;
      if (method === 'shutdown') return null as T;
      return null as T;
    },
    sendNotification() {},
    onNotification() {
      return { dispose() {} };
    },
    dispose() {},
  };
}

function tsConfig(cmd = 'fake') {
  return {
    enabled: true as const,
    autoStart: false as const,
    servers: { ts: { command: cmd, args: [], filePatterns: ['**/*.ts'] } },
  };
}

describe('HIGH-2 explicit unavailable (FAKE transport)', () => {
  it('disabled config throws instead of silent []', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-h2-disabled-'));
    try {
      await fs.writeFile(path.join(root, 'a.ts'), 'export const x = 1;');
      const svc = new ChimeraLspService(root, {
        config: { enabled: false, autoStart: false, servers: { ts: { command: 'fake', args: [] } } },
        connectionFactory: async () => fakeConnection(),
      });
      await svc.start();
      await expect(svc.goToDefinition('a.ts', 1, 1)).rejects.toThrow(/disabled/i);
      await expect(svc.workspaceSymbols('x')).rejects.toThrow(/disabled/i);
      await svc.dispose().catch(() => {});
    } finally {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('no matching server throws instead of silent []', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-h2-noserver-'));
    try {
      await fs.writeFile(path.join(root, 'a.py'), 'x = 1');
      const svc = new ChimeraLspService(root, {
        config: tsConfig(),
        connectionFactory: async () => fakeConnection(),
      });
      await svc.start();
      await expect(svc.goToDefinition('a.py', 1, 1)).rejects.toThrow(/No LSP server configured/);
      await svc.dispose().catch(() => {});
    } finally {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('startup failure throws unavailable with server error', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-h2-startfail-'));
    try {
      await fs.writeFile(path.join(root, 'a.ts'), 'export const x = 1;');
      const svc = new ChimeraLspService(root, {
        config: tsConfig('definitely-missing-binary-xyz'),
        connectionFactory: async () => {
          throw new Error('spawn ENOENT');
        },
      });
      await svc.start();
      await expect(svc.goToDefinition('a.ts', 1, 1)).rejects.toThrow(/unavailable.*ENOENT|ENOENT.*unavailable/i);
      const st = svc.status();
      expect(st[0].status).toBe('error');
      await svc.dispose().catch(() => {});
    } finally {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('ready server with no matches still returns successful []', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-h2-emptyok-'));
    try {
      await fs.writeFile(path.join(root, 'a.ts'), 'export const x = 1;');
      const svc = new ChimeraLspService(root, {
        config: tsConfig(),
        connectionFactory: async () =>
          fakeConnection((method) => {
            if (method === 'initialize') return { capabilities: {} };
            if (method === 'textDocument/definition') return [];
            return null;
          }),
      });
      await svc.start();
      const locs = await svc.goToDefinition('a.ts', 1, 1);
      expect(locs).toEqual([]);
      await svc.dispose().catch(() => {});
    } finally {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe('HIGH-3 canonical containment (FAKE transport)', () => {
  it('rejects relative traversal, absolute outside, and file URI outside', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-h3-contain-'));
    try {
      await fs.writeFile(path.join(root, 'a.ts'), 'export const x = 1;');
      const svc = new ChimeraLspService(root, {
        config: tsConfig(),
        connectionFactory: async () => fakeConnection(),
      });
      await svc.start();
      await expect(svc.goToDefinition('../../outside.ts', 1, 1)).rejects.toThrow(/escapes workspace/);
      const outsideAbs = path.join(os.tmpdir(), 'chimera-h3-outside.ts');
      await expect(svc.goToDefinition(outsideAbs, 1, 1)).rejects.toThrow(/escapes workspace/);
      await expect(svc.goToDefinition(pathToFileURL(outsideAbs).toString(), 1, 1)).rejects.toThrow(
        /escapes workspace/,
      );
      await expect(assertWorkspaceContainment(outsideAbs, root)).rejects.toThrow();
      await svc.dispose().catch(() => {});
    } finally {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('rejects symlink escape to outside file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-h3-sym-'));
    try {
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-h3-sym-out-'));
      const outsideFile = path.join(outside, 'secret.ts');
      await fs.writeFile(outsideFile, 'export const s = 1;');
      const linkPath = path.join(root, 'link.ts');
      try {
        await fs.symlink(outsideFile, linkPath);
      } catch {
        // Windows without symlink privilege — assert helper directly on the
        // absolute outside path instead (still proves containment).
        await expect(assertWorkspaceContainment(outsideFile, root)).rejects.toThrow();
        return;
      }
      const svc = new ChimeraLspService(root, {
        config: tsConfig(),
        connectionFactory: async () => fakeConnection(),
      });
      await svc.start();
      await expect(svc.goToDefinition('link.ts', 1, 1)).rejects.toThrow(/symlink|escapes workspace/);
      await svc.dispose().catch(() => {});
      await fs.rm(outside, { recursive: true, force: true }).catch(() => {});
    } finally {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('allows inside absolute path and inside file URI', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-h3-allow-'));
    try {
      const file = path.join(root, 'ok.ts');
      await fs.writeFile(file, 'export const x = 1;');
      await expect(assertWorkspaceContainment(file, root)).resolves.toBeUndefined();
      await expect(assertWorkspaceContainment(pathToFileURL(file).toString(), root)).resolves.toBeUndefined();
      await expect(assertWorkspaceContainment('ok.ts', root)).resolves.toBeUndefined();
    } finally {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });
});
