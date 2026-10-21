import { expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLspConnection, terminateLspProcess, type LspConnection } from '../connection.js';

const windowsTest = process.platform === 'win32' ? it : it.skip;
const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch { return false; } };

windowsTest('starts a Windows batch server with literal arguments and releases its owned tree', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'chimera batch '));
  let child: ChildProcessWithoutNullStreams | undefined;
  let serverPid: number | undefined;
  const argument = 'literal & echo INJECTED > injected.txt';
  try {
    await fs.writeFile(join(root, 'server.cjs'), 'console.log(JSON.stringify({pid:process.pid,args:process.argv.slice(2)})); setInterval(()=>{},1000);');
    await fs.writeFile(join(root, 'server.cmd'), `@echo off\r\n"${process.execPath}" "%~dp0server.cjs" %*\r\n`);
    const started = await startLspConnection({
      workspaceRoot: root,
      config: { command: join(root, 'server.cmd'), args: [argument] },
      connectionFactory: async owned => {
        child = owned;
        const ready = await new Promise<string>((resolve, reject) => {
          owned.stdout.once('data', data => resolve(String(data)));
          owned.once('error', reject);
          owned.once('exit', () => reject(new Error('Batch server exited before ready')));
        });
        const record = JSON.parse(ready.trim());
        serverPid = record.pid;
        expect(record.args).toEqual([argument]);
        return { listen() {}, dispose() {}, onNotification: () => ({ dispose() {} }), sendNotification() {}, sendRequest: async () => null } as unknown as LspConnection;
      },
    });
    expect(alive(serverPid!)).toBe(true);
    await expect(fs.access(join(root, 'injected.txt'))).rejects.toThrow();
    await terminateLspProcess(started.child);
    expect(alive(serverPid!)).toBe(false);
  } finally {
    if (child) await terminateLspProcess(child);
    if (serverPid && alive(serverPid)) process.kill(serverPid);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 15000);

windowsTest('terminates descendants before the language-server parent exits', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'chimera-owned-tree-'));
  let child: ChildProcessWithoutNullStreams | undefined;
  let descendant: number | undefined;
  try {
    await fs.writeFile(join(root, 'descendant.cjs'), 'setInterval(()=>{},1000);');
    await fs.writeFile(join(root, 'parent.cjs'), `const child=require('node:child_process').spawn(process.execPath,[${JSON.stringify(join(root, 'descendant.cjs'))}],{stdio:'ignore',detached:true}); child.unref(); console.log(child.pid); setInterval(()=>{},1000);`);
    child = spawn(process.execPath, [join(root, 'parent.cjs')], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    descendant = await new Promise<number>((resolve, reject) => {
      child!.stdout.once('data', data => resolve(Number(String(data).trim())));
      child!.once('error', reject);
    });
    expect(alive(descendant)).toBe(true);
    await terminateLspProcess(child);
    expect(alive(child.pid!)).toBe(false);
    expect(alive(descendant)).toBe(false);
  } finally {
    if (child) await terminateLspProcess(child);
    if (descendant && alive(descendant)) process.kill(descendant);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 15000);
