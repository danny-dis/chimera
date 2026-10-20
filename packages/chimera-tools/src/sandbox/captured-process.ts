import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';

interface CapturedResult {
  stdout: string; stderr: string; exitCode?: number; signal?: string;
  failed: boolean; isMaxBuffer: boolean; shortMessage: string;
}

export function spawnCaptured(
  command: string, args: string[], options: SpawnOptionsWithoutStdio,
  maxBuffer: number, onOutputLimit: () => void,
) {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  const result = new Promise<CapturedResult>(resolve => {
    const buffers = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
    const sizes = { stdout: 0, stderr: 0 };
    let failure = '', isMaxBuffer = false;
    const recordError = (error: Error) => { failure ||= error.message; };
    for (const name of ['stdout', 'stderr'] as const) {
      child[name].on('error', recordError);
      child[name].on('data', (chunk: Buffer) => {
        if (isMaxBuffer) return;
        const remaining = maxBuffer - sizes[name];
        if (remaining > 0) buffers[name].push(chunk.subarray(0, remaining));
        sizes[name] += Math.min(chunk.length, remaining);
        if (chunk.length > remaining) {
          isMaxBuffer = true;
          failure = `${name} maxBuffer exceeded`;
          try { onOutputLimit(); } catch (error) { recordError(error as Error); }
        }
      });
    }
    child.once('error', recordError);
    child.once('close', (code, signal) => resolve({
      stdout: Buffer.concat(buffers.stdout).toString('utf8').replace(/\r?\n$/, ''),
      stderr: Buffer.concat(buffers.stderr).toString('utf8').replace(/\r?\n$/, ''),
      exitCode: code ?? undefined, signal: signal ?? undefined,
      failed: !!failure || code !== 0, isMaxBuffer,
      shortMessage: failure || (signal ? `Command was killed with ${signal}` : ''),
    }));
  });
  return { child, result };
}
