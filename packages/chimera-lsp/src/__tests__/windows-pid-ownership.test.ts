import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ snapshots: 0, kills: [] as number[], dead: new Set<number>() }));
vi.mock('node:fs', async original => ({ ...await original<typeof import('node:fs')>(), existsSync: () => false }));
vi.mock('child_process', () => ({ execFile: (file: string, args: string[], _options: unknown, callback: Function) => {
  if (file === 'powershell.exe') {
    const rows = state.snapshots++ === 0
      ? [{ ProcessId: 70001, ParentProcessId: 0, CreationDate: '/Date(100)/' }, { ProcessId: 70002, ParentProcessId: 70001, CreationDate: '/Date(101)/' }]
      : [{ ProcessId: 70002, ParentProcessId: 99999, CreationDate: '/Date(1000)/' }];
    callback(null, JSON.stringify(rows));
  } else {
    const pid = Number(args[1]); state.kills.push(pid); state.dead.add(pid); callback(null, '');
  }
} }));
import { captureLspProcessTree, terminateWindowsProcessTree } from '../windows-process-tree.js';
const windowsTest = process.platform === 'win32' ? it : it.skip;
windowsTest('never kills a reused descendant PID after protocol shutdown', async () => {
  const child = { pid: 70001, spawnfile: 'node.exe', exitCode: null, signalCode: null } as any;
  const kill = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
    if (state.dead.has(pid)) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
    return true;
  });
  try {
    await captureLspProcessTree(child);
    child.exitCode = 0; state.dead.add(child.pid);
    await terminateWindowsProcessTree(child);
    expect(state.kills).toEqual([]);
  } finally { kill.mockRestore(); }
});
