import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { ChimeraLspService, createJsonRpcConnection, type LspConnection, type LspServerConfig } from '@chimera/lsp';

let workspaceRoot: string;
let service: ChimeraLspService;

const tsLspBin = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'typescript-language-server.CMD');

async function testConnectionFactory(
  child: ChildProcessWithoutNullStreams,
  _config: LspServerConfig,
): Promise<LspConnection> {
  return createJsonRpcConnection(child);
}

describe('LSP Tool (integration)', () => {
  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-lsp-int-'));
    await fs.writeFile(
      path.join(workspaceRoot, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'ESNext',
          moduleResolution: 'node',
          strict: true,
        },
        include: ['**/*.ts'],
      }),
    );
  }, 10000);

  afterEach(async () => {
    if (service) {
      await service.dispose().catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 200));
    await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
  }, 10000);

  async function writeFixture(name: string, content: string): Promise<string> {
    const filePath = path.join(workspaceRoot, name);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  async function startService(): Promise<ChimeraLspService> {
    const svc = new ChimeraLspService(workspaceRoot, {
      config: {
        enabled: true,
        autoStart: true,
        diagnosticsLimit: 200,
        servers: {
          ts: {
            command: tsLspBin,
            args: ['--stdio'],
          },
        },
      },
      connectionFactory: testConnectionFactory,
    });
    await svc.start();
    return svc;
  }

  it('spawns and connects to typescript-language-server', async () => {
    service = await startService();
    await new Promise((r) => setTimeout(r, 2000));
    const status = service.status();
    expect(status.length).toBe(1);
    expect(status[0].name).toBe('ts');
    expect(status[0].status).toBe('ready');
  }, 15000);

  it('returns document symbols', async () => {
    const filePath = await writeFixture(
      'example.ts',
      [
        'export function greet(name: string): string {',
        '  return `hi ${name}`;',
        '}',
        'export const answer: number = 42;',
      ].join('\n'),
    );

    service = await startService();
    await new Promise((r) => setTimeout(r, 2000));

    const symbols = await service.documentSymbols(filePath);
    expect(symbols.length).toBeGreaterThan(0);
    const names = symbols.map((s) => s.name);
    expect(names).toContain('greet');
    expect(names).toContain('answer');
  }, 30000);

  it('returns hover info', async () => {
    const filePath = await writeFixture(
      'hover.ts',
      [
        'export function add(a: number, b: number): number {',
        '  return a + b;',
        '}',
      ].join('\n'),
    );

    service = await startService();
    await new Promise((r) => setTimeout(r, 2000));

    const hover = await service.hover(filePath, 1, 16);
    expect(hover).not.toBeNull();
    expect(hover!.contents).toContain('add');
  }, 30000);

});
