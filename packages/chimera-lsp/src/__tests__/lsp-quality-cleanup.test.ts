import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const state = vi.hoisted(() => ({ child: undefined as any }));
vi.mock('child_process', () => ({ spawn: () => state.child }));
import { startLspConnection, JsonRpcLspConnection } from '../connection.js';
import { ChimeraLspService } from '../lsp-service.js';
const cfg = { command: 'node', args: [], enabled: true, languages: ['typescript'] };
function child() { return Object.assign(new EventEmitter(), { pid: 99, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, signalCode: null, kill: vi.fn(() => true) }); }
function transport() { return { sendRequest: vi.fn(async (_method: string) => ({ capabilities: {} })), sendNotification: vi.fn(), onNotification: vi.fn(), listen: vi.fn(), dispose: vi.fn() }; }
afterEach(() => vi.clearAllMocks());
it('routes public document updates through the serialized ensureFile path only', async () => {
  const connection = transport();
  const service = new ChimeraLspService(process.cwd(), { config: { servers: { test: cfg } } });
  const ensure = vi.spyOn(service as any, 'ensureFile').mockResolvedValue({ connection, openDocuments: new Set() });
  const read = vi.spyOn(fs, 'readFile').mockResolvedValue('export const a = 1;');
  try {
    await service.updateDocument('a.ts');
    expect(ensure).toHaveBeenCalledOnce();
    expect(ensure).toHaveBeenCalledWith('a.ts');
    expect(read).not.toHaveBeenCalled();
    expect(connection.sendNotification).not.toHaveBeenCalled();
  } finally { read.mockRestore(); ensure.mockRestore(); await service.dispose(); }
});
it('bounds shutdown of a retained transport when listen and initial disposal fail', async () => {
  vi.useFakeTimers(); state.child = child(); const connection = transport();
  state.child.kill.mockImplementation(() => { state.child.exitCode = 0; return true; });
  connection.listen.mockImplementation(() => { throw new Error('listen failed'); });
  connection.dispose.mockImplementationOnce(() => { throw new Error('cleanup failed'); });
  let release!: () => void;
  const shutdown = new Promise<void>(resolve => { release = resolve; });
  connection.sendRequest.mockImplementation(async request => { if (request === 'shutdown') await shutdown; return { capabilities: {} }; });
  const service = new ChimeraLspService(process.cwd(), { requestTimeoutMs: 50, config: { servers: { test: cfg } }, connectionFactory: async () => connection });
  let finished = false; const started = service.start().then(() => { finished = true; });
  try { await vi.advanceTimersByTimeAsync(200); expect(finished).toBe(true); }
  finally { release(); await started; state.child.exitCode = 0; await service.dispose(); vi.useRealTimers(); }
});
it('retains failed disposal of a factory connection arriving after startup timeout', async () => {
  vi.useFakeTimers();
  state.child = child(); const connection = transport(); let release!: (value: any) => void;
  state.child.kill.mockImplementation(() => { state.child.exitCode = 0; return true; });
  let failCleanup = true;
  connection.dispose.mockImplementation(() => { if (failCleanup) throw new Error('late transport failed'); });
  const service = new ChimeraLspService(process.cwd(), { requestTimeoutMs: 50, config: { servers: { test: cfg } }, connectionFactory: () => new Promise(resolve => { release = resolve; }) });
  const started = service.start();
  try {
    await vi.advanceTimersByTimeAsync(10001);
    release(connection); await vi.advanceTimersByTimeAsync(0); await started;
    await expect(service.dispose()).rejects.toThrow(/late transport failed/);
    failCleanup = false;
    await service.dispose();
    expect(connection.dispose.mock.calls.length).toBeGreaterThan(1);
  } finally { failCleanup = false; release(connection); await service.dispose().catch(() => undefined); vi.useRealTimers(); }
});
it('shares in-flight didOpen so concurrent queries cannot open the document twice', async () => {
  state.child = child(); const connection = transport();
  const service = new ChimeraLspService(process.cwd(), { config: { servers: { test: cfg } }, connectionFactory: async () => connection });
  await service.start();
  const read = vi.spyOn(fs, 'readFile').mockResolvedValue('export const a = 1;');
  let release!: () => void;
  const sent = new Promise<void>(resolve => { release = resolve; });
  connection.sendNotification.mockImplementation(method => method === 'textDocument/didOpen' ? sent : undefined);
  const server = (service as any).servers.get('test');
  const pending = Promise.all([(service as any).openDocument(server, 'a.ts'), (service as any).openDocument(server, 'a.ts')]);
  try {
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(connection.sendNotification.mock.calls.filter(call => call[0] === 'textDocument/didOpen')).toHaveLength(1);
    release(); await pending;
  } finally { release(); await pending; read.mockRestore(); state.child.exitCode = 0; await service.dispose(); }
});
it('returns the real JSON-RPC notification promise instead of discarding rejection', async () => {
  const notification = Promise.reject(new Error('notification failed'));
  void notification.catch(() => undefined);
  const connection = new JsonRpcLspConnection({ sendNotification: () => notification } as any);
  expect(connection.sendNotification('textDocument/didOpen')).toBe(notification);
  await expect(notification).rejects.toThrow('notification failed');
});
it('retains the transport when listen and startup disposal both fail', async () => {
  state.child = child(); const connection = transport();
  state.child.kill.mockImplementation(() => { state.child.exitCode = 0; return true; });
  connection.listen.mockImplementation(() => { throw new Error('listen failed'); });
  connection.dispose.mockImplementationOnce(() => { throw new Error('first cleanup failed'); }).mockImplementationOnce(() => { throw new Error('second cleanup failed'); });
  const service = new ChimeraLspService(process.cwd(), { config: { servers: { test: cfg } }, connectionFactory: async () => connection });
  try {
    await service.start();
    expect(service.status()[0].status).toBe('error');
    await service.dispose();
    expect(connection.dispose).toHaveBeenCalledTimes(3);
  } finally { state.child.exitCode = 0; await service.dispose().catch(() => undefined); }
});
it('retains failed transport disposal for retry even after child termination', async () => {
  state.child = child(); const connection = transport();
  const service = new ChimeraLspService(process.cwd(), { config: { servers: { test: cfg } }, connectionFactory: async () => connection });
  await service.start(); state.child.exitCode = 0;
  connection.dispose.mockImplementationOnce(() => { throw new Error('transport cleanup failed'); });
  try {
    await expect(service.dispose()).rejects.toThrow(/transport cleanup failed/);
    await service.dispose();
    expect(connection.dispose).toHaveBeenCalledTimes(2);
  } finally { await service.dispose().catch(() => undefined); }
});
it.each([
  ['textDocument/didOpen', false], ['textDocument/didChange', false],
  ['textDocument/didOpen', true], ['textDocument/didChange', true],
] as const)('retries failed %s async=%s before advancing cached text/version', async (method, asyncFailure) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-lsp-sync-'));
  state.child = child(); const connection = transport();
  const service = new ChimeraLspService(root, { config: { servers: { test: { ...cfg, filePatterns: ['**/*.ts'] } } }, connectionFactory: async () => connection });
  try {
    await fs.writeFile(path.join(root, 'a.ts'), 'export const a = 1;');
    await service.start();
    if (method === 'textDocument/didChange') {
      await service.getDiagnostics('a.ts');
      await fs.writeFile(path.join(root, 'a.ts'), 'export const a = 2;');
    }
    let failing = true;
    connection.sendNotification.mockImplementation(notification => {
      if (notification === method && failing) {
        const error = new Error('notification failed');
        if (!asyncFailure) throw error;
        const rejected = Promise.reject(error);
        void rejected.catch(() => undefined);
        return rejected;
      }
    });
    await expect(service.getDiagnostics('a.ts')).rejects.toThrow('notification failed');
    failing = false; await service.getDiagnostics('a.ts');
    const attempts = connection.sendNotification.mock.calls.filter(call => call[0] === method);
    expect(attempts).toHaveLength(2);
    expect(attempts[1][1]).toEqual(attempts[0][1]);
  } finally { state.child.exitCode = 0; await service.dispose(); await fs.rm(root, { recursive: true, force: true }); }
});
it('retains a child error listener during failed-factory cleanup', async () => {
  state.child = child(); let protectedDuringKill = false;
  state.child.kill.mockImplementation(() => { protectedDuringKill = state.child.listenerCount('error') > 0; state.child.exitCode = 0; return true; });
  await expect(startLspConnection({ name: 'test', config: cfg, workspaceRoot: process.cwd(), connectionFactory: async () => { throw new Error('factory failed'); } })).rejects.toThrow('factory failed');
  expect(protectedDuringKill).toBe(true);
});
it('coalesces concurrent service disposal and disposes transport once', async () => {
  state.child = child(); const connection = transport(); let release!: () => void;
  const shutdown = new Promise<void>(resolve => { release = resolve; });
  connection.sendRequest.mockImplementation(async request => {
    if (request === 'shutdown') { await shutdown; return undefined as any; }
    return { capabilities: {} };
  });
  const service = new ChimeraLspService(process.cwd(), { config: { servers: { test: cfg } }, connectionFactory: async () => connection });
  await service.start();
  try {
    const first = service.dispose(), second = service.dispose();
    const settled = Promise.all([first, second]);
    state.child.exitCode = 0; release(); await settled;
    expect(connection.dispose).toHaveBeenCalledTimes(1);
  } finally { release(); state.child.exitCode = 0; await service.dispose().catch(() => undefined); }
});
