import type { ChildProcessWithoutNullStreams } from 'child_process';
import { snapshotWindowsProcesses, terminateOwnedWindowsProcess, type NativeWindowsProcess } from './windows-process-native.js';
import { ownedWindowsProcess } from './windows-owned-process.js';

interface OwnedTree {
  processes: Map<number, NativeWindowsProcess>;
}
const ownedTrees = new WeakMap<ChildProcessWithoutNullStreams, OwnedTree>();

function retainedChildAlive(child: ChildProcessWithoutNullStreams): boolean {
  if (child.exitCode !== null || child.signalCode !== null || typeof child.kill !== 'function') return false;
  const descriptor = Object.getOwnPropertyDescriptor(child, 'killed');
  try { return child.kill(0); }
  finally { if (descriptor) Object.defineProperty(child, 'killed', descriptor); }
}

function creationTime(row: NativeWindowsProcess): bigint {
  if (!row.CreationDate) throw new Error(`LSP process ${row.ProcessId} identity unavailable`);
  return BigInt(row.CreationDate.split(':').at(-1)!);
}

function addDescendants(processes: Map<number, NativeWindowsProcess>, snapshot: NativeWindowsProcess[], roots: Set<number>): void {
  let added: boolean;
  do {
    added = false;
    for (const row of snapshot) {
      if (row.ProcessId > 0 && roots.has(row.ParentProcessId) && !roots.has(row.ProcessId)
        && creationTime(row) >= creationTime(processes.get(row.ParentProcessId)!)) {
        processes.set(row.ProcessId, row);
        roots.add(row.ProcessId);
        added = true;
      }
    }
  } while (added);
}

export async function captureLspProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (process.platform !== 'win32' || !child.spawnfile || !child.pid || ownedTrees.has(child)) return;
  if (child.spawnargs?.[1] === ownedWindowsProcess('', []).args[0]) return;
  const snapshot = snapshotWindowsProcesses();
  const processes = new Map<number, NativeWindowsProcess>();
  const parent = snapshot.find(row => row.ProcessId === child.pid);
  if (parent && !parent.CreationDate) throw new Error(`LSP process ${child.pid} identity unavailable`);
  if (parent && retainedChildAlive(child)) processes.set(parent.ProcessId, parent);
  addDescendants(processes, snapshot, new Set(processes.keys()));
  ownedTrees.set(child, { processes });
}

export async function terminateWindowsProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.spawnargs?.[1] === ownedWindowsProcess('', []).args[0]) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => { clearTimeout(timer); child.removeListener('close', onClose); error ? reject(error) : resolve(); };
      const onClose = () => finish();
      const timer = setTimeout(() => finish(new Error('Owned Windows job did not close')), 1000);
      child.once('close', onClose);
      child.kill();
    });
    return;
  }
  await captureLspProcessTree(child);
  const tree = ownedTrees.get(child);
  if (!tree || tree.processes.size === 0) return;
  const snapshot = snapshotWindowsProcesses();
  const current = new Map(snapshot.map(row => [row.ProcessId, row]));
  for (const [pid, owned] of tree.processes) {
    if (current.has(pid) && !current.get(pid)!.CreationDate) throw new Error(`LSP process ${pid} identity unavailable`);
    if (current.get(pid)?.CreationDate !== owned.CreationDate) tree.processes.delete(pid);
  }
  addDescendants(tree.processes, snapshot, new Set(tree.processes.keys()));
  for (const owned of [...tree.processes.values()].reverse()) {
    await terminateOwnedWindowsProcess(owned.ProcessId, owned.CreationDate);
  }
  // Retain the empty record so a later call cannot rediscover a reused parent PID.
  tree.processes.clear();
}
