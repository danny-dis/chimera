import { afterEach, expect, it, vi } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const fault = vi.hoisted(() => ({ kill: undefined as (() => Promise<void>) | undefined, calls: 0 }));
vi.mock('child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFile: (...args: any[]) => {
    if (args[0] === 'taskkill.exe' && fault.kill) {
      fault.calls++;
      const callback = args.at(-1);
      void fault.kill().then(() => callback(Object.assign(new Error('injected taskkill timeout'), { killed: true })));
      return {};
    }
    return (actual.execFile as any)(...args);
  } };
});
import { startLspConnection, terminateLspProcess, type LspConnection } from '../connection.js';
import { ChimeraLspService } from '../lsp-service.js';
const windowsTest = process.platform === 'win32' ? it : it.skip;
const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch { return false; } };
afterEach(() => { fault.kill = undefined; fault.calls = 0; });

async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), 'chimera-tree-retry-'));
  await fs.writeFile(join(root, 'descendant.cjs'), "console.log('READY');setInterval(()=>{},1000);");
  await fs.writeFile(join(root, 'parent.cjs'), `const c=require('node:child_process').spawn(process.execPath,[${JSON.stringify(join(root, 'descendant.cjs'))}],{detached:true,stdio:['ignore','pipe','ignore']});c.stdout.once('data',()=>console.log(c.pid));c.unref();setInterval(()=>{},1000);`);
  let child: ChildProcessWithoutNullStreams | undefined;
  let descendant: number | undefined;
  const factory = async (owned: ChildProcessWithoutNullStreams): Promise<LspConnection> => {
    child = owned;
    descendant = await new Promise<number>((resolve, reject) => {
      owned.stdout.once('data', data => resolve(Number(String(data).trim())));
      owned.once('error', reject);
      owned.once('exit', () => reject(new Error('parent exited before READY')));
    });
    expect(alive(child.pid!)).toBe(true);
    expect(alive(descendant)).toBe(true);
    return { listen() {}, dispose() {}, onNotification: () => ({ dispose() {} }),
      sendRequest: async () => ({ capabilities: {} }), sendNotification() {} } as LspConnection;
  };
  const exitParent = async () => {
    if (child && alive(child.pid!)) {
      const exited = new Promise<void>(resolve => child!.once('exit', () => resolve()));
      child.kill(); await exited;
    }
  };
  const cleanup = async () => {
    fault.kill = undefined;
    if (child) await exitParent();
    if (descendant && alive(descendant)) process.kill(descendant);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  };
  return { root, factory, exitParent, cleanup, config: { command: process.execPath, args: [join(root, 'parent.cjs')] },
    child: () => child!, descendant: () => descendant! };
}

windowsTest('cleans descendants when protocol exit has already stopped the parent', async () => {
  const owned = await fixture();
  const service = new ChimeraLspService(owned.root, {
    config: { servers: { test: owned.config } },
    connectionFactory: async child => {
      const connection = await owned.factory(child);
      connection.sendNotification = async method => { if (method === 'exit') await owned.exitParent(); };
      return connection;
    },
  });
  try {
    await service.start(); expect(service.status()[0].status).toBe('ready');
    await service.dispose();
    expect(alive(owned.child().pid!)).toBe(false);
    expect(alive(owned.descendant())).toBe(false);
  } finally { await service.dispose().catch(() => undefined); await owned.cleanup(); }
}, 30000);

windowsTest('retains failed tree ownership when taskkill times out after parent exit and retries descendants', async () => {
  const owned = await fixture();
  const service = new ChimeraLspService(owned.root, { config: { servers: { test: owned.config } }, connectionFactory: owned.factory });
  try {
    await service.start(); expect(service.status()[0].status).toBe('ready');
    fault.kill = owned.exitParent;
    await expect(service.dispose()).rejects.toThrow(/tree cleanup failed/);
    expect(fault.calls).toBeGreaterThan(0);
    expect(alive(owned.child().pid!)).toBe(false);
    expect(alive(owned.descendant())).toBe(true);
    expect((service as any).servers.get('test').child).toBe(owned.child());
    fault.kill = undefined;
    await service.dispose();
    expect(alive(owned.descendant())).toBe(false);
    expect((service as any).servers.get('test').child).toBeUndefined();
  } finally { fault.kill = undefined; await service.dispose().catch(() => undefined); await owned.cleanup(); }
}, 30000);

windowsTest('startup cleanup retains an exited parent with surviving descendants for retry', async () => {
  const owned = await fixture();
  try {
    fault.kill = owned.exitParent;
    const attempt = startLspConnection({ workspaceRoot: owned.root, config: owned.config,
      connectionFactory: async child => { const connection = await owned.factory(child); connection.listen = () => { throw new Error('listen failed'); }; return connection; } });
    await expect(attempt).rejects.toMatchObject({ child: expect.anything() });
    expect(alive(owned.child().pid!)).toBe(false);
    expect(alive(owned.descendant())).toBe(true);
    fault.kill = undefined;
    await terminateLspProcess(owned.child());
    expect(alive(owned.descendant())).toBe(false);
  } finally { await owned.cleanup(); }
}, 30000);
