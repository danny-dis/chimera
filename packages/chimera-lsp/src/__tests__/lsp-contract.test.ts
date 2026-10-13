import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { ChimeraLspService } from '../lsp-service.js';
import type { LspConnection } from '../connection.js';

// FAKE transport (plumbing only, NOT protocol proof): in-memory stub,
// never spawns a real language server. Real-server proof lives in
// packages/chimera-tools/src/__tests__/lsp-tool.test.ts.
function fakeConnection(handlers: {
  onRequest?: (method: string) => unknown;
  notifications?: Array<{ method: string; params?: unknown }>;
}): LspConnection {
  const notifs = handlers.notifications ?? [];
  return {
    listen() {},
    async sendRequest<T>(method: string): Promise<T> {
      if (handlers.onRequest) return handlers.onRequest(method) as T;
      if (method === 'initialize') return { capabilities: {} } as T;
      if (method === 'shutdown') return null as T;
      throw new Error(`unexpected fake request: ${method}`);
    },
    sendNotification(method: string, params?: unknown): void {
      notifs.push({ method, params });
    },
    onNotification() {
      return { dispose() {} };
    },
    dispose() {},
  };
}

describe('LSP contract (FAKE transport — plumbing only, NOT protocol proof)', () => {
  it('G1: startup failure preserves error status', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-gap-g1-'));
    try {
      const svc = new ChimeraLspService(root, {
        config: {
          enabled: true,
          autoStart: false,
          servers: { bad: { command: 'definitely-missing-binary-xyz', args: [] } },
        },
        connectionFactory: async () => {
          throw new Error('spawn ENOENT');
        },
      });
      await svc.start();
      // Trigger a start attempt via a matching file.
      await fs.writeFile(path.join(root, 'a.ts'), 'export const x = 1;');
      await svc.goToDefinition('a.ts', 1, 1).catch(() => undefined);
      const st = svc.status();
      expect(st[0].status).toBe('error');
      expect(st[0].error ?? '').toContain('ENOENT');
      await svc.dispose().catch(() => {});
    } finally {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('G2: hierarchical documentSymbol filePath ends with fixture name', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-gap-g2-'));
    try {
      const file = path.join(root, 'sym.ts');
      await fs.writeFile(file, 'export class Box { open() { return true; } }');
      const svc = new ChimeraLspService(root, {
        config: {
          enabled: true,
          autoStart: false,
          servers: { ts: { command: 'fake', args: [], filePatterns: ['**/*.ts'] } },
        },
        connectionFactory: async () =>
          fakeConnection({
            onRequest: (method: string) => {
              if (method === 'initialize') return { capabilities: {} };
              if (method === 'textDocument/documentSymbol') {
                return [
                  {
                    name: 'Box',
                    kind: 5,
                    range: {
                      start: { line: 0, character: 0 },
                      end: { line: 0, character: 10 },
                    },
                    selectionRange: {
                      start: { line: 0, character: 0 },
                      end: { line: 0, character: 3 },
                    },
                    children: [],
                  },
                ];
              }
              return null;
            },
          }),
      });
      await svc.start();
      const symbols = await svc.documentSymbols('sym.ts');
      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols[0].range.filePath).toMatch(/sym\.ts$/);
      await svc.dispose().catch(() => {});
    } finally {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('G3-doc: relative path escape is rejected', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-gap-g3-'));
    try {
      const svc = new ChimeraLspService(root, {
        config: {
          enabled: true,
          autoStart: false,
          servers: { ts: { command: 'fake', args: [], filePatterns: ['**/*.ts'] } },
        },
        connectionFactory: async () => fakeConnection({}),
      });
      await svc.start();
      await expect(svc.goToDefinition('../../outside-escape.ts', 1, 1)).rejects.toThrow();
      await svc.dispose().catch(() => {});
    } finally {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('doc sync: second write pushes didChange with bumped version + current text', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-gap-sync-'));
    try {
      const file = path.join(root, 'doc.ts');
      await fs.writeFile(file, 'export const v = 1;');
      const notifications: Array<{ method: string; params?: unknown }> = [];
      const svc = new ChimeraLspService(root, {
        config: {
          enabled: true,
          autoStart: false,
          servers: { ts: { command: 'fake', args: [], filePatterns: ['**/*.ts'] } },
        },
        connectionFactory: async () =>
          fakeConnection({
            notifications,
            onRequest: (method: string) => {
              if (method === 'initialize') return { capabilities: {} };
              return null;
            },
          }),
      });
      await svc.start();
      await svc.documentSymbols('doc.ts'); // opens the document (didOpen v1)
      await fs.writeFile(file, 'export const v = 2;');
      await svc.updateDocument('doc.ts'); // must push didChange v2
      const changes = notifications.filter((n) => n.method === 'textDocument/didChange');
      expect(changes.length).toBeGreaterThan(0);
      const last = changes[changes.length - 1].params as {
        textDocument: { version: number };
        contentChanges: Array<{ text: string }>;
      };
      expect(last.textDocument.version).toBe(2);
      expect(last.contentChanges[0].text).toContain('v = 2');
      await svc.dispose().catch(() => {});
    } finally {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });
});
