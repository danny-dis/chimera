import { afterEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChimeraLspService } from '../lsp-service.js';
import type { LspConnection } from '../connection.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

it.each(['initialize', 'textDocument/definition', 'shutdown'])('bounds hung %s and terminates its exact child', async hung => {
  const root = await fs.mkdtemp(join(tmpdir(), 'chimera-lsp-owned-')); roots.push(root);
  await fs.writeFile(join(root, 'a.ts'), 'export const a = 1;');
  await fs.writeFile(join(root, 'server.cjs'), "process.stdout.write('READY'); setInterval(() => {}, 1000); setTimeout(() => process.exit(0), 8000);");
  let pid: number | undefined;
  const requests: string[] = [];
  let childExited!: Promise<void>;
  let sentChange = false;
  const service = new ChimeraLspService(root, {
    requestTimeoutMs: 75,
    config: { autoStart: true, servers: { ts: { command: process.execPath, args: [join(root, 'server.cjs')], filePatterns: ['**/*.ts'] } } },
    connectionFactory: async child => {
      childExited = new Promise(resolve => child.once('exit', () => resolve()));
      await new Promise<void>((resolve, reject) => { child.stdout.once('data', () => resolve()); child.once('error', reject); });
      pid = child.pid;
      return {
        listen() {}, onNotification: () => ({ dispose() {} }), dispose() {},
        sendNotification: method => { if (method === 'textDocument/didChange') sentChange = true; },
        sendRequest: async method => {
          requests.push(method);
          return method === hung ? new Promise<never>(() => {})
            : method === 'initialize' ? { capabilities: {} } : [];
        },
      } as LspConnection;
    },
  } as any);
  try {
    await service.start();
    expect(pid).toBeTypeOf('number');
    if (hung === 'initialize') expect(service.status()[0]).toMatchObject({ status: 'error', error: expect.stringMatching(/timed out/i) });
    else if (hung === 'textDocument/definition') await expect(service.goToDefinition('a.ts', 1, 1)).rejects.toThrow(/timed out/i);
    else {
      await service.goToDefinition('a.ts', 1, 1);
      await fs.writeFile(join(root, 'a.ts'), 'export const a = 2;');
      await service.goToDefinition('a.ts', 1, 1);
      expect(sentChange).toBe(true);
    }
    const beforeDispose = Date.now();
    await service.dispose();
    expect(Date.now() - beforeDispose).toBeLessThan(1500);
    expect(requests).toContain(hung);
    await childExited;
    expect(() => process.kill(pid!, 0)).toThrow();
  } finally { await service.dispose(); }
}, 10000);
