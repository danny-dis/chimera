import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ snapshots: 0, terminate: vi.fn() }));
vi.mock('../windows-process-native.js', () => ({
  snapshotWindowsProcesses: () => state.snapshots++ === 0
    ? [{ ProcessId: 70001, ParentProcessId: 0, CreationDate: '/Date(100)/:1000000' }, { ProcessId: 70002, ParentProcessId: 70001, CreationDate: '/Date(101)/:1010000' }]
    : [{ ProcessId: 70002, ParentProcessId: 99999, CreationDate: '/Date(1000)/:10000000' }],
  terminateOwnedWindowsProcess: state.terminate,
}));
import { captureLspProcessTree, terminateWindowsProcessTree } from '../windows-process-tree.js';
const windowsTest = process.platform === 'win32' ? it : it.skip;
windowsTest('never kills a reused descendant PID after protocol shutdown', async () => {
  const child = { pid: 70001, spawnfile: 'node.exe', exitCode: null, signalCode: null } as any;
  await captureLspProcessTree(child);
  child.exitCode = 0;
  await terminateWindowsProcessTree(child);
  expect(state.terminate).not.toHaveBeenCalled();
});
