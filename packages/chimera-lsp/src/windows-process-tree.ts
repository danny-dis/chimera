import { execFile, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

interface WindowsProcess {
  ProcessId: number;
  ParentProcessId: number;
  CreationDate: string;
}
interface OwnedTree {
  processes: Map<number, WindowsProcess>;
}
const ownedTrees = new WeakMap<ChildProcessWithoutNullStreams, OwnedTree>();
const wmic = join(process.env.SystemRoot ?? 'C:/Windows', 'System32/wbem/WMIC.exe');
const nativeSnapshot = existsSync(wmic);

async function processSnapshot(): Promise<WindowsProcess[]> {
  const output = await new Promise<string>((resolve, reject) => {
    const command = nativeSnapshot ? wmic : 'powershell.exe';
    const args = nativeSnapshot ? ['path', 'Win32_Process', 'get', 'ProcessId,ParentProcessId,CreationDate', '/format:csv']
      : ['-NoProfile', '-NonInteractive', '-Command',
        'Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId,ParentProcessId,CreationDate | ConvertTo-Json -Compress'];
    execFile(command, args,
    { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) reject(new Error('LSP process-tree discovery failed', { cause: error }));
      else resolve(stdout);
    });
  });
  const parsed = nativeSnapshot ? output.trim().split(/[\r\n]+/).slice(1).filter(Boolean).map(line => {
    const [, CreationDate, parent, pid] = line.split(',');
    return { ProcessId: Number(pid), ParentProcessId: Number(parent), CreationDate };
  }) : JSON.parse(output);
  const rows: WindowsProcess[] = Array.isArray(parsed) ? parsed : [parsed];
  if (rows.some(row => !row || !Number.isInteger(row.ProcessId) || !Number.isInteger(row.ParentProcessId) || typeof row.CreationDate !== 'string')) {
    throw new Error('Invalid LSP process-tree snapshot');
  }
  return rows;
}

function addDescendants(processes: Map<number, WindowsProcess>, snapshot: WindowsProcess[], roots: Set<number>): void {
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

function creationTime(row: WindowsProcess): number {
  const date = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.(\d{3})\d{3}([+-]\d{3})$/.exec(row.CreationDate);
  return date ? Date.UTC(+date[1], +date[2] - 1, +date[3], +date[4], +date[5], +date[6], +date[7]) - Number(date[8]) * 60_000
    : Number(/-?\d+/.exec(row.CreationDate)?.[0]);
}

export async function captureLspProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (process.platform !== 'win32' || !child.spawnfile || !child.pid || ownedTrees.has(child)) return;
  const snapshot = await processSnapshot();
  const processes = new Map<number, WindowsProcess>();
  const parent = snapshot.find(row => row.ProcessId === child.pid);
  if (parent && child.exitCode === null && child.signalCode === null) processes.set(parent.ProcessId, parent);
  addDescendants(processes, snapshot, new Set(processes.keys()));
  ownedTrees.set(child, { processes });
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

export async function terminateWindowsProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
  await captureLspProcessTree(child);
  const tree = ownedTrees.get(child);
  if (!tree || tree.processes.size === 0) return;
  {
    const snapshot = await processSnapshot();
    const current = new Map(snapshot.map(row => [row.ProcessId, row]));
    for (const [pid, owned] of tree.processes) {
      if (current.get(pid)?.CreationDate !== owned.CreationDate) tree.processes.delete(pid);
    }
    addDescendants(tree.processes, snapshot, new Set(tree.processes.keys()));
  }

  for (const pid of [...tree.processes.keys()].reverse()) {
    if (!isAlive(pid)) continue;
    await new Promise<void>((resolve, reject) => {
      execFile('taskkill.exe', ['/PID', String(pid), '/F'], { windowsHide: true, timeout: 5000 }, error => {
        if (error && isAlive(pid)) reject(new Error(`LSP child ${child.pid} tree cleanup failed`, { cause: error }));
        else resolve();
      });
    });
  }
  const deadline = Date.now() + 1000;
  while ([...tree.processes.keys()].some(isAlive)) {
    if (Date.now() >= deadline) throw new Error(`LSP child ${child.pid} tree did not exit`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  // Keep the empty ownership record: later calls must not rediscover a reused parent PID.
  tree.processes.clear();
}
