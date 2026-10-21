import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ row: 0, calls: [] as string[], failQuery: false }));
vi.mock('koffi', () => ({ default: {
  struct: (fields: Record<string, unknown>) => ({ basic: 'ExitStatus' in fields }),
  array: () => ({}), sizeof: () => 64, address: () => 1n,
  decode: (buffer: Buffer, type: { basic: boolean }) => type.basic
    ? { UniqueProcessId: buffer.readUInt32LE(0), InheritedFromUniqueProcessId: buffer.readUInt32LE(4) }
    : { th32ProcessID: 80001 + state.row, th32ParentProcessID: 0 },
  load: () => ({ func: (signature: string) => {
    if (signature.includes('CreateToolhelp32Snapshot')) return () => 'snapshot';
    if (signature.includes('Process32FirstW')) return () => { state.row = 0; return 1; };
    if (signature.includes('Process32NextW')) return () => ++state.row < 2 ? 1 : 0;
    if (signature.includes('OpenProcess')) return (_access: number, _inherit: number, pid: number) => { state.calls.push(`open:${pid}`); return pid; };
    if (signature.includes('NtQueryInformationProcess')) return (pid: number, _kind: number, buffer: Buffer) => {
      state.calls.push(`query:${pid}`);
      if (state.failQuery && pid === 80002) throw new Error('query failed');
      buffer.writeUInt32LE(pid, 0); buffer.writeUInt32LE(pid === 80002 ? 80001 : 0, 4); return 0;
    };
    if (signature.includes('GetProcessTimes')) return (pid: number, creation: Buffer) => { creation.writeBigUInt64LE(BigInt(pid)); return 1; };
    if (signature.includes('WaitForSingleObject')) return () => 258;
    if (signature.includes('CloseHandle')) return (handle: unknown) => { state.calls.push(`close:${handle}`); return 1; };
    if (signature.includes('GetLastError')) return () => 18;
    if (signature.includes('TerminateProcess')) return () => 1;
    throw new Error(`Unexpected native function: ${signature}`);
  } }),
} }));
import { snapshotWindowsProcesses } from '../windows-process-native.js';
const windowsTest = process.platform === 'win32' ? it : it.skip;
windowsTest('pins ancestor process generations until every descendant row has been sampled', () => {
  state.calls = []; state.failQuery = false;
  const rows = snapshotWindowsProcesses();
  expect(rows).toHaveLength(2);
  expect(rows[1].ParentProcessId).toBe(80001);
  expect(state.calls.indexOf('close:80001')).toBeGreaterThan(state.calls.indexOf('query:80002'));
  expect(state.calls.filter(call => call.startsWith('close:'))).toEqual(['close:80001', 'close:80002', 'close:snapshot']);
});
windowsTest('releases every pinned process handle when later enumeration fails', () => {
  state.calls = []; state.failQuery = true;
  expect(() => snapshotWindowsProcesses()).toThrow('query failed');
  expect(state.calls.filter(call => call.startsWith('close:'))).toEqual(['close:80001', 'close:80002', 'close:snapshot']);
  state.failQuery = false;
});
