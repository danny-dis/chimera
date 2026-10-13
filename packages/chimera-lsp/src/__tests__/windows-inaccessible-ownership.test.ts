import { expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ rows: [] as any[], terminate: vi.fn() }));
vi.mock('../windows-process-native.js', () => ({ snapshotWindowsProcesses: () => native.rows, terminateOwnedWindowsProcess: native.terminate }));
import { captureLspProcessTree, terminateWindowsProcessTree } from '../windows-process-tree.js';
const windowsTest = process.platform === 'win32' ? it : it.skip;
windowsTest('retains inaccessible owned descendants and retries instead of reporting successful cleanup', async () => {
  const child = { pid: 70001, spawnfile: 'node.exe', kill: vi.fn(() => true), exitCode: null, signalCode: null } as any;
  const parent = { ProcessId: 70001, ParentProcessId: 0, CreationDate: '/Date(100)/:100' };
  const descendant = { ProcessId: 70002, ParentProcessId: 70001, CreationDate: '/Date(101)/:101' };
  native.rows = [parent, descendant];
  await captureLspProcessTree(child);
  child.exitCode = 0;
  native.rows = [{ ...descendant, CreationDate: '' }];
  await expect(terminateWindowsProcessTree(child)).rejects.toThrow('identity unavailable');
  expect(native.terminate).not.toHaveBeenCalled();
  native.rows = [descendant];
  await terminateWindowsProcessTree(child);
  expect(native.terminate).toHaveBeenCalledWith(70002, descendant.CreationDate);
});
windowsTest('does not cache an empty ownership record for an inaccessible live root', async () => {
  const child = { pid: 80001, spawnfile: 'node.exe', kill: vi.fn(() => true), exitCode: null, signalCode: null } as any;
  native.rows = [{ ProcessId: 80001, ParentProcessId: 0, CreationDate: '' }];
  await expect(captureLspProcessTree(child)).rejects.toThrow('identity unavailable');
  native.rows[0].CreationDate = '/Date(100)/:100';
  await captureLspProcessTree(child);
  await terminateWindowsProcessTree(child);
  expect(native.terminate).toHaveBeenCalledWith(80001, '/Date(100)/:100');
});
