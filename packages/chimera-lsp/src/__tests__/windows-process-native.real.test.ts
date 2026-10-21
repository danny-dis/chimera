import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { snapshotWindowsProcesses } from '../windows-process-native.js';
import { captureLspProcessTree, terminateWindowsProcessTree } from '../windows-process-tree.js';

const windowsTest = process.platform === 'win32' ? it : it.skip;
windowsTest('captures stable native birth IDs and cleans only the owned child within 1.5s', async () => {
  const owned = spawn(process.execPath, ['-e', "console.log('READY');setInterval(()=>{},1000)"]);
  const unrelated = spawn(process.execPath, ['-e', "console.log('READY');setInterval(()=>{},1000)"]);
  const ready = (child: typeof owned) => new Promise<void>((resolve, reject) => {
    child.stdout.once('data', () => resolve());
    child.once('error', reject);
    child.once('exit', () => reject(new Error('child exited before READY')));
  });
  try {
    await Promise.all([ready(owned), ready(unrelated)]);
    const started = performance.now();
    const first = snapshotWindowsProcesses();
    const second = snapshotWindowsProcesses();
    const birth = first.find(row => row.ProcessId === owned.pid)!;
    expect(birth.ParentProcessId).toBe(process.pid);
    expect(birth.CreationDate).toMatch(/^\/Date\(\d+\)\/:\d+$/);
    expect(second.find(row => row.ProcessId === owned.pid)?.CreationDate).toBe(birth.CreationDate);
    await captureLspProcessTree(owned);
    await terminateWindowsProcessTree(owned);
    expect(performance.now() - started).toBeLessThan(1500);
    expect(() => process.kill(owned.pid!, 0)).toThrow();
    expect(() => process.kill(unrelated.pid!, 0)).not.toThrow();
    await terminateWindowsProcessTree(owned);
  } finally {
    const stop = async (child: typeof owned) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
      child.kill(); await exited;
    };
    await Promise.all([stop(owned), stop(unrelated)]);
  }
}, 15000);
