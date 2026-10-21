import { expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChimeraLspService, createJsonRpcConnection } from '@chimera/lsp';
import { resolveDefaultLspConfig } from '../lsp-registry.js';

it('queries real TypeScript safely in an untrusted workspace and releases its owned PID', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'chimera-ts-protocol-'));
  const previousStore = process.env.CHIMERA_TRUST_STORE;
  process.env.CHIMERA_TRUST_STORE = join(root, 'no-trusted-workspaces');
  let service: ChimeraLspService | undefined;
  let pid: number | undefined;
  let exited!: Promise<void>;
  try {
    await fs.mkdir(join(root, '.chimera'));
    await fs.writeFile(join(root, 'evil.cjs'), `require('fs').writeFileSync(${JSON.stringify(join(root, 'EVIL_EXECUTED'))}, 'bad');`);
    await fs.writeFile(join(root, '.chimera', 'config.yaml'), `lsp:\n  servers:\n    evil:\n      command: ${JSON.stringify(process.execPath)}\n      args: [${JSON.stringify(join(root, 'evil.cjs'))}]\n`);
    await fs.writeFile(join(root, 'package.json'), '{"name":"lsp-protocol-fixture","private":true}');
    await fs.writeFile(join(root, 'a.ts'), 'export function alpha() { return 1; }\nalpha();\n');
    const config = await resolveDefaultLspConfig(root);
    expect(config.servers.evil).toBeUndefined();
    const options = config.servers.typescript.initializationOptions as { tsserver: { path: string }; disableAutomaticTypingAcquisition: boolean };
    expect(options.tsserver.path).not.toContain(root);
    expect(options.disableAutomaticTypingAcquisition).toBe(true);
    service = new ChimeraLspService(root, { config, connectionFactory: async (child, serverConfig) => {
      pid = child.pid;
      exited = new Promise(resolve => child.once('exit', () => resolve()));
      return createJsonRpcConnection(child, serverConfig);
    } });
    await service.start();
    expect(service.status()).toEqual([expect.objectContaining({ name: 'typescript', status: 'ready' })]);
    expect(pid).toBeTypeOf('number');
    const before = await service.documentSymbols('a.ts');
    expect(before.some(symbol => symbol.name === 'alpha')).toBe(true);
    const definitions = await service.goToDefinition('a.ts', 2, 2);
    expect(definitions).toEqual(expect.arrayContaining([expect.objectContaining({ filePath: 'a.ts', range: expect.objectContaining({ start: expect.objectContaining({ line: 0 }) }) })]));
    await fs.writeFile(join(root, 'a.ts'), 'export function beta() { return 2; }\nbeta();\n');
    const after = await service.documentSymbols('a.ts');
    expect(after.some(symbol => symbol.name === 'beta')).toBe(true);
    expect(after.some(symbol => symbol.name === 'alpha')).toBe(false);
    await expect(fs.access(join(root, 'EVIL_EXECUTED'))).rejects.toThrow();
    await service.dispose(); await exited;
    expect(() => process.kill(pid!, 0)).toThrow();
  } finally {
    await service?.dispose();
    if (previousStore === undefined) delete process.env.CHIMERA_TRUST_STORE;
    else process.env.CHIMERA_TRUST_STORE = previousStore;
    await fs.rm(root, { recursive: true, force: true });
  }
}, 60000);
