import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { terminateOwnedWindowsProcess } from '@chimera/lsp/dist/windows-process-native.js';
import { runShellCommandTool } from '../tools/shell.js';
import type { ToolContext } from '../tool-schema.js';
(process.platform === 'win32' ? it.each(['shell','raw-spawn','raw-spawn-detached']) : it.skip.each(['shell','raw-spawn','raw-spawn-detached']))('reaps the command when its owning caller dies abruptly (%s)', async kind => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-owner-death-'));
  let leaf: { ProcessId: number; CreationDate: string } | undefined;
  let caller: ReturnType<typeof spawn> | undefined;
  try {
    fs.writeFileSync(path.join(root, 'leaf.cjs'), `setTimeout(()=>process.exit(2),30000);const self=require(${JSON.stringify(path.resolve(__dirname, '../../../chimera-lsp/dist/windows-process-native.js'))}).snapshotWindowsProcesses().find(p=>p.ProcessId===process.pid);require('node:fs').writeFileSync('ready.json',JSON.stringify(self));setInterval(()=>{},1000);`);
    const runner = kind === 'shell'
      ? `const {runShellCommandTool}=require(${JSON.stringify(path.resolve(__dirname,'../../dist/index.js'))});runShellCommandTool.execute({command:'"'+process.execPath+'" leaf.cjs',timeout:60000},{workspaceRoot:process.cwd()}).then(()=>process.exit(0));`
      : `const {spawn}=require('node:child_process');const {ownedWindowsProcess}=require(${JSON.stringify(path.resolve(__dirname,'../../../chimera-lsp/dist/index.js'))});const spec=ownedWindowsProcess(process.execPath,['leaf.cjs']);spawn(spec.command,spec.args,{stdio:'ignore',windowsHide:true,detached:${kind === 'raw-spawn-detached'}});setInterval(()=>{},1000);`;
    fs.writeFileSync(path.join(root, 'runner.cjs'), runner);
    caller = spawn(process.execPath, [path.join(root,'runner.cjs')], { cwd:root, stdio:'ignore', windowsHide:true });
    const ready = path.join(root,'ready.json'), started = Date.now()+10000;
    while (!fs.existsSync(ready) && Date.now()<started) await new Promise(resolve=>setTimeout(resolve,20));
    expect(fs.existsSync(ready),'owned child must start').toBe(true);
    leaf = JSON.parse(fs.readFileSync(ready,'utf8'));
    expect(alive(leaf!.ProcessId)).toBe(true);
    const closed = new Promise(resolve=>caller!.once('close',resolve));
    caller.kill('SIGKILL'); await closed;
    const stopped = Date.now()+1500;
    while(alive(leaf!.ProcessId)&&Date.now()<stopped)await new Promise(resolve=>setTimeout(resolve,20));
    expect(alive(leaf!.ProcessId),'owner death must close the owned job').toBe(false);
  } finally {
    const closed = caller && caller.exitCode === null && caller.signalCode === null
      ? new Promise<void>(resolve => caller!.once('close', () => resolve())) : Promise.resolve();
    caller?.kill();
    await closed;
    if (!leaf && fs.existsSync(path.join(root, 'ready.json'))) {
      try { leaf = JSON.parse(fs.readFileSync(path.join(root, 'ready.json'), 'utf8')); } catch { /* finite fixture watchdog */ }
    }
    if (leaf) terminateOwnedWindowsProcess(leaf.ProcessId, leaf.CreationDate);
    await fs.promises.rm(root,{recursive:true,force:true,maxRetries:5});
  }
},20000);
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
(process.platform === 'win32' ? it.each(['ignore', 'inherit']) : it.skip.each(['ignore', 'inherit']))('cleans orphaned descendants after successful parent exit (%s stdio)', async stdio => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-shell-orphan-'));
  const sentinel = spawn(process.execPath, ['-e', 'setTimeout(()=>{},15000)'], { stdio: 'ignore', windowsHide: true });
  let receipt: { ProcessId: number; CreationDate: string } | undefined;
  let pid: number | undefined;
  let pending: Promise<any> | undefined;
  const controller = new AbortController();
  try {
    fs.writeFileSync(path.join(root, 'leaf.cjs'), `setTimeout(()=>process.exit(2),30000);const self=require(${JSON.stringify(path.resolve(__dirname, '../../../chimera-lsp/dist/windows-process-native.js'))}).snapshotWindowsProcesses().find(p=>p.ProcessId===process.pid);require('node:fs').writeFileSync('ready.json',JSON.stringify(self));`);
    fs.writeFileSync(path.join(root, 'parent.cjs'), `require('node:child_process').spawn(process.execPath,['leaf.cjs'],{detached:true,stdio:${JSON.stringify(stdio)}}).unref();const t=setInterval(()=>{if(require('node:fs').existsSync('ready.json')){clearInterval(t);setTimeout(()=>process.exit(0),200)}},10);`);
    const start = Date.now();
    pending = runShellCommandTool.execute({ command: `"${process.execPath}" parent.cjs`, timeout: 8000 }, { workspaceRoot: root, signal: controller.signal } as ToolContext);
    while (!fs.existsSync(path.join(root, 'ready.json')) && Date.now() - start < 5000) await new Promise(resolve => setTimeout(resolve, 20));
    expect(fs.existsSync(path.join(root, 'ready.json'))).toBe(true);
    receipt = JSON.parse(fs.readFileSync(path.join(root, 'ready.json'), 'utf8'));
    pid = receipt!.ProcessId;
    expect(alive(pid!)).toBe(true);
    const settledAt = Date.now();
    const result = await Promise.race([pending, new Promise<never>((_resolve, reject) => { const timer = setTimeout(() => reject(new Error('Orphan holds owned command open')), 3000); timer.unref(); })]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(Date.now() - settledAt).toBeLessThan(3000);
    const deadline = Date.now() + 1000;
    while (alive(pid!) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    expect(alive(pid!)).toBe(false);
    expect(alive(sentinel.pid!)).toBe(true);
  } finally {
    controller.abort();
    if (receipt) terminateOwnedWindowsProcess(receipt.ProcessId, receipt.CreationDate);
    const sentinelClosed = sentinel.exitCode === null ? new Promise<void>(resolve => sentinel.once('close', () => resolve())) : Promise.resolve();
    sentinel.kill();
    await sentinelClosed;
    await pending?.catch(() => undefined);
    await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
}, 15000);
