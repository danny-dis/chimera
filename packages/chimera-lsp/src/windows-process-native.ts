import koffi from 'koffi';

export interface NativeWindowsProcess {
  ProcessId: number;
  ParentProcessId: number;
  CreationDate: string;
}

function loadApi() {
  const kernel = koffi.load('kernel32.dll');
  const ntdll = koffi.load('ntdll.dll');
  const basic = koffi.struct({ ExitStatus: 'int32_t', PebBaseAddress: 'void *', AffinityMask: 'uintptr_t',
    BasePriority: 'int32_t', UniqueProcessId: 'uintptr_t', InheritedFromUniqueProcessId: 'uintptr_t' });
  const entry = koffi.struct({
    dwSize: 'uint32_t', cntUsage: 'uint32_t', th32ProcessID: 'uint32_t',
    th32DefaultHeapID: 'uintptr_t', th32ModuleID: 'uint32_t', cntThreads: 'uint32_t',
    th32ParentProcessID: 'uint32_t', pcPriClassBase: 'int32_t', dwFlags: 'uint32_t',
    szExeFile: koffi.array('uint16_t', 260),
  });
  return {
    entry,
    basic,
    query: ntdll.func('int32_t __stdcall NtQueryInformationProcess(void * process, uint32_t infoClass, void * info, uint32_t length, void * returnedLength)'),
    snapshot: kernel.func('void * __stdcall CreateToolhelp32Snapshot(uint32_t flags, uint32_t pid)'),
    first: kernel.func('int __stdcall Process32FirstW(void * snapshot, void * entry)'),
    next: kernel.func('int __stdcall Process32NextW(void * snapshot, void * entry)'),
    open: kernel.func('void * __stdcall OpenProcess(uint32_t access, int inherit, uint32_t pid)'),
    times: kernel.func('int __stdcall GetProcessTimes(void * process, void * creation, void * exit, void * kernel, void * user)'),
    terminate: kernel.func('int __stdcall TerminateProcess(void * process, uint32_t exitCode)'),
    wait: kernel.func('uint32_t __stdcall WaitForSingleObject(void * handle, uint32_t milliseconds)'),
    close: kernel.func('int __stdcall CloseHandle(void * handle)'),
    error: kernel.func('uint32_t __stdcall GetLastError()'),
  };
}
let api: ReturnType<typeof loadApi> | undefined;

export function terminateOwnedWindowsProcess(pid: number, birthIdentity: string): void {
  const win = api ??= loadApi();
  const handle = win.open(0x101001, 0, pid);
  if (!handle) {
    if (win.error() === 87) return;
    throw new Error(`LSP process ${pid} cleanup unavailable (${win.error()})`);
  }
  try {
    const creation = Buffer.alloc(8);
    if (!win.times(handle, creation, Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8))) {
      throw new Error(`LSP process ${pid} identity unavailable`);
    }
    if (birthIdentity.split(':').at(-1) !== String(creation.readBigUInt64LE())) return;
    if (win.wait(handle, 0) === 0) return;
    win.terminate(handle, 1);
    if (win.wait(handle, 1000) !== 0) {
      throw new Error(`LSP process ${pid} tree cleanup failed (${win.error()})`);
    }
  } finally { win.close(handle); }
}

/** Birth identity keeps all 100ns ticks; the Date prefix supports ancestry ordering. */
export function snapshotWindowsProcesses(): NativeWindowsProcess[] {
  if (process.platform !== 'win32') throw new Error('Windows process snapshot requires Windows');
  const win = api ??= loadApi();
  const snapshot = win.snapshot(2, 0);
  if (!snapshot || koffi.address(snapshot) === (process.arch === 'ia32' ? 0xffffffffn : 0xffffffffffffffffn)) {
    throw new Error(`LSP process-tree discovery failed (${win.error()})`);
  }
  const handles: unknown[] = [];
  try {
    const buffer = Buffer.alloc(koffi.sizeof(win.entry));
    buffer.writeUInt32LE(buffer.length);
    const rows: NativeWindowsProcess[] = [];
    let found = win.first(snapshot, buffer);
    while (found) {
      const row = koffi.decode(buffer, win.entry) as { th32ProcessID: number; th32ParentProcessID: number };
      const handle = row.th32ProcessID > 0 ? win.open(0x101400, 0, row.th32ProcessID) : null;
      let exited = !handle && win.error() === 87;
      let identity = '';
      let parentPid = 0;
      if (handle) {
        handles.push(handle);
          const creation = Buffer.alloc(8);
          const information = Buffer.alloc(koffi.sizeof(win.basic));
          if (win.query(handle, 0, information, information.length, null) >= 0
            && win.times(handle, creation, Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8))) {
            const basic = koffi.decode(information, win.basic) as { UniqueProcessId: number; InheritedFromUniqueProcessId: number };
            if (Number(basic.UniqueProcessId) !== row.th32ProcessID) throw new Error('Process handle identity mismatch');
            parentPid = Number(basic.InheritedFromUniqueProcessId);
            const ticks = creation.readBigUInt64LE();
            const ms = (ticks - 116444736000000000n) / 10000n;
            identity = `/Date(${ms})/:${ticks}`;
          }
          exited = win.wait(handle, 0) === 0;
      }
      if (row.th32ProcessID > 0 && !exited) rows.push({ ProcessId: row.th32ProcessID,
        ParentProcessId: parentPid, CreationDate: identity });
      found = win.next(snapshot, buffer);
    }
    if (win.error() !== 18) throw new Error(`LSP process-tree enumeration failed (${win.error()})`);
    return rows;
  } finally {
    for (const handle of handles) win.close(handle);
    win.close(snapshot);
  }
}
