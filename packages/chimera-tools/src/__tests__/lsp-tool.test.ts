import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { ChimeraLspService, createJsonRpcConnection, type LspConnection, type LspServerConfig } from '@chimera/lsp';
import { lspTool } from '../tools/lsp.js';
import { disposeAllLspServices } from '../lsp-registry.js';

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
    await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
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
      path.join('src', 'example.ts'),
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
      path.join('src', 'hover.ts'),
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

// Exercises the `lsp` TOOL itself end-to-end through the module-level registry
// (getOrCreateLspService), which defaults to a real TypeScript server when the
// workspace configures none. Each run uses a fresh mkdtemp root so the
// registry cache keyed by workspaceRoot never collides across runs.
describe('LSP tool end-to-end (registry)', () => {
  let fixtureRoot: string;
  let fooPath: string;
  let barPath: string;

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-lsp-tool-'));
    await fs.mkdir(path.join(fixtureRoot, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(fixtureRoot, 'tsconfig.json'),
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
    await fs.writeFile(
      path.join(fixtureRoot, 'package.json'),
      JSON.stringify({ name: 'lsp-tool-fixture', version: '1.0.0', private: true }),
    );
    fooPath = path.join(fixtureRoot, 'src', 'foo.ts');
    barPath = path.join(fixtureRoot, 'src', 'bar.ts');
    await fs.writeFile(
      fooPath,
      [
        'export function greet(name: string): string {',
        "  return 'hi ' + name;",
        '}',
      ].join('\n'),
    );
    await fs.writeFile(
      barPath,
      [
        "import { greet } from './foo';",
        '',
        "export const message: string = greet('world');",
      ].join('\n'),
    );
  }, 30000);

  afterAll(async () => {
    disposeAllLspServices();
    await fs.rm(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  }, 30000);

  const toolContext = (): any => ({
    workspaceRoot: fixtureRoot,
    sessionId: 'test',
    eventStream: undefined,
    signal: undefined,
  });

  it('documentSymbol returns the exported function via the tool', async () => {
    const result = await lspTool.execute({ operation: 'documentSymbol', filePath: fooPath }, toolContext());
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.formatted).toContain('greet');
  }, 60000);

  it('goToDefinition from the import site resolves into foo.ts', async () => {
    const result = await lspTool.execute(
      { operation: 'goToDefinition', filePath: barPath, line: 1, character: 10 },
      toolContext(),
    );
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.formatted).toContain('foo.ts');
  }, 60000);

  it('hover on the function call returns non-empty info', async () => {
    const result = await lspTool.execute(
      { operation: 'hover', filePath: barPath, line: 3, character: 32 },
      toolContext(),
    );
    expect(result.formatted.length).toBeGreaterThan(0);
  }, 60000);
});
