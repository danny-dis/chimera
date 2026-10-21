import { z } from 'zod';
import { spawnCaptured } from '../sandbox/captured-process.js';
import path from 'path';
import type { ToolDefinition, ToolContext } from '../tool-schema.js';
import { MAX_OUTPUT_SIZE, DEFAULT_SHELL_TIMEOUT, MAX_SHELL_TIMEOUT } from '../tool-schema.js';
import { PathRestrictionEngine } from '../permission/path-restrictions.js';
import { EnvironmentFilter } from '../sandbox/env-filter.js';

// ── Dangerous command patterns ───────────────────────────────────────────────

const DANGEROUS_PATTERNS = [
  // rm -rf / variants
  /^\s*rm\s+(-rf?|--force)\s+\/\s*$/,
  /^\s*rm\s+(-rf?|--force)\s+\/\s*;/,
  /^\s*rm\s+(-rf?|--force)\s+\/\s*\|/,
  // dd / overwrite block devices
  /^\s*>\s*\/dev\/(sda|sdb|sdc)/,
  /^\s*dd\s+.*of=\/dev\/sd/,
  /^\s*mkfs/,
  // fork bomb
  /^\s*:\(\)\{\s*:\|:\s*&\s*\}\s*;/,
  // chmod 777 on root
  /^\s*chmod\s+777\s+\/\s*$/,
  /^\s*chmod\s+-R\s+777\s+\/\s*$/,
  // sudo rm -rf /
  /^\s*sudo\s+rm\s+(-rf?|--force)\s+\/\s*$/,
  // sudo with rm
  /^\s*sudo\s+.*\brm\b.*\s+(-rf?|--force)\s+\/\s*$/,
  // mv to /dev/null (data loss)
  /^\s*mv\s+.*\/dev\/null/,
  // shred
  /^\s*shred\s+/,
  // Command substitution that could escape root: $(rm -rf /), `rm -rf /`
  /\$\(\s*rm\s+(-rf?|--force)\s+\/\s*\)/,
  /\`\s*rm\s+(-rf?|--force)\s+\/\s*\`/,
  // Pipe to shell: echo "rm -rf /" | bash, command | sh
  /\|\s*(?:ba)?sh\b/,
  // eval with dangerous content
  /\beval\b.*\brm\s+(-rf?|--force)\s+\/\s*/,
  // curl/wget pipe to shell
  /\b(curl|wget)\b.*\|\s*(?:ba)?sh/,
];

/**
 * Split a command string on shell separators (`;`, `&&`, `||`, `|`) and return
 * non-empty trimmed segments. Simple split — quoting-awareness is not handled.
 */
export function splitShellSegments(command: string): string[] {
  return command
    .split(/&&|\|\||;|\|/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

export function isDangerous(command: string): boolean {
  const segments = splitShellSegments(command);
  const targets = [command, ...segments];
  for (const target of targets) {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(target)) return true;
    }
  }
  return false;
}

function truncateOutput(output: string, limit = MAX_OUTPUT_SIZE): { text: string; truncated: boolean } {
  if (Buffer.byteLength(output, 'utf-8') > limit) {
    return {
      text: output.substring(0, limit) + '\n... [output truncated]',
      truncated: true,
    };
  }
  return { text: output, truncated: false };
}

const SAFE_ENV_ALLOWLIST = new Set(
  [
    'PATH', 'PATHEXT', 'SYSTEMROOT', 'COMSPEC', 'TEMP', 'TMP',
    'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA',
    'LANG', 'LC_ALL', 'TERM', 'TZ', 'NUMBER_OF_PROCESSORS',
    'OS', 'PROCESSOR_ARCHITECTURE', 'PROGRAMDATA', 'PROGRAMFILES',
    'SYSTEMDRIVE', 'WINDIR',
    'NODE_ENV', 'NODE_OPTIONS',
    'CI',
  ].map((v) => v.toUpperCase()),
);

function filterEnv(env: Record<string, string> = {}): Record<string, string> {
  const filter = new EnvironmentFilter();
  return filter.filter(env);
}

function buildChildEnv(explicit: Record<string, string>): Record<string, string> {
  const childEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    const upper = key.toUpperCase();
    if (SAFE_ENV_ALLOWLIST.has(upper) && typeof value === 'string') {
      childEnv[key] = value;
    }
  }
  const filteredExplicit = filterEnv(explicit);
  return { ...childEnv, ...filteredExplicit };
}

// ── run_shell_command ────────────────────────────────────────────────────────

/**
 * Reap the owned Job Object host on Windows, or the detached POSIX process group.
 * Killing the Windows host closes its job handle and reaps descendants.
 * Never a global name kill.
 */
function ownedTreeKill(subprocess: { pid?: number; kill(signal: 'SIGKILL'): boolean }): void {
  const pid = subprocess.pid;
  if (pid === undefined) return;
  if (process.platform === 'win32') {
    subprocess.kill('SIGKILL');
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); }
  catch { try { process.kill(pid, 'SIGKILL'); } catch { /* already exited */ } }
}

const RunShellCommandParamsSchema = z.object({
  command: z.string().min(1, 'Command must not be empty'),
  cwd: z.string().optional(),
  timeout: z.number().int().positive().default(DEFAULT_SHELL_TIMEOUT),
  env: z.record(z.string()).optional(),
});

const RunShellCommandReturnsSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
  duration: z.number(),
});

export const runShellCommandTool: ToolDefinition<typeof RunShellCommandParamsSchema, typeof RunShellCommandReturnsSchema> = {
  name: 'run_shell_command',
  description: 'Execute a shell command with timeout and output limits',
  parameters: RunShellCommandParamsSchema,
  returns: RunShellCommandReturnsSchema,
  category: 'shell',
  permissionLevel: 'execute',
  execute: async (params, context: ToolContext) => {
    if (isDangerous(params.command)) {
      throw new Error(`Command rejected as dangerous: ${params.command}`);
    }

    if (context.signal?.aborted) {
      throw new Error('Execution cancelled before start');
    }

    const timeout = Math.min(params.timeout, MAX_SHELL_TIMEOUT);
    const pathEngine = new PathRestrictionEngine(context.workspaceRoot);
    const canonicalRoot = pathEngine.getCanonicalRoot();
    const workingDir = params.cwd
      ? path.resolve(canonicalRoot, params.cwd)
      : canonicalRoot;
    if (!pathEngine.isPathAllowed(workingDir)) {
      throw new Error(`Working directory escapes workspace root: ${params.cwd}`);
    }

    const childEnv = buildChildEnv(params.env ?? {});

    const startTime = Date.now();

    let result: { stdout: string; stderr: string; exitCode: number };
    let subprocess: ReturnType<typeof spawnCaptured>['child'] | undefined;

    try {
      const isWindows = process.platform === 'win32';
      const shellBin = isWindows ? 'cmd.exe' : 'bash';
      const shellArgs = isWindows ? ['/d', '/s', '/c', `"${params.command}"`] : ['-c', params.command];
      const nodeOptionsKey = Object.keys(childEnv).find(key => key.toUpperCase() === 'NODE_OPTIONS');
      const hostEnv = isWindows ? Object.fromEntries(Object.entries(childEnv).filter(([key]) => key.toUpperCase() !== 'NODE_OPTIONS')) : childEnv;
      const owned = isWindows
        ? (require('@chimera/lsp/dist/windows-owned-process.js') as typeof import('@chimera/lsp/dist/windows-owned-process.js')).ownedWindowsProcess(shellBin, shellArgs, true, nodeOptionsKey ? childEnv[nodeOptionsKey] : undefined)
        : { command: shellBin, args: shellArgs, windowsVerbatimArguments: false };
      if (context.signal?.aborted) throw Object.assign(new Error('Command cancelled'), { isCanceled: true });
      if (Date.now() - startTime >= timeout) throw Object.assign(new Error('Command timed out during startup'), { timedOut: true });
      const started = spawnCaptured(owned.command, owned.args, {
        cwd: workingDir,
        env: hostEnv,
        windowsHide: isWindows,
        windowsVerbatimArguments: owned.windowsVerbatimArguments,
        detached: !isWindows,
      }, MAX_OUTPUT_SIZE, () => treeKill());
      subprocess = started.child;
      // One deadline owner kills the whole tree before waiting for inherited pipes.
      let cancelled = context.signal?.aborted ?? false;
      let timedOut = false;
      const closed = new Promise<void>(resolve => subprocess!.once('close', () => resolve()));
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
      let rejectCleanup!: (error: Error) => void;
      const cleanupDeadline = new Promise<never>((_resolve, reject) => { rejectCleanup = reject; });
      const treeKill = () => {
        try { ownedTreeKill(subprocess!); }
        catch { rejectCleanup(new Error('Owned process cleanup failed')); }
        cleanupTimer ??= setTimeout(() => rejectCleanup(new Error('Owned process did not settle after cancellation')), 1000);
        cleanupTimer.unref();
      };
      const onAbort = () => { cancelled = true; treeKill(); };
      if (cancelled) treeKill();
      else if (context.signal) {
        context.signal.addEventListener('abort', onAbort, { once: true });
      }
      const timer = setTimeout(() => { timedOut = true; treeKill(); }, Math.max(1, timeout - (Date.now() - startTime)));
      try {
        const settled = await Promise.race([
          started.result.then(result => ({ result }), error => ({ error })).then(async outcome => { await closed; return outcome; }),
          cleanupDeadline,
        ]);
        if ('error' in settled) throw settled.error;
        const execResult = settled.result as {
          stdout: string;
          stderr: string;
          exitCode?: number;
          isCanceled?: boolean;
          failed?: boolean;
          isMaxBuffer?: boolean;
          signal?: string;
          shortMessage?: string;
        };
        if (cancelled || execResult.isCanceled) {
          treeKill();
          return {
            stdout: '',
            stderr: 'Command cancelled',
            exitCode: -1,
            duration: Date.now() - startTime,
          };
        }
        if (timedOut) {
          return {
            stdout: '',
            stderr: `Command timed out after ${timeout}ms`,
            exitCode: -1,
            duration: timeout,
          };
        }
        result = {
          stdout: execResult.stdout,
          stderr: execResult.stderr || (execResult.failed || execResult.isMaxBuffer || execResult.signal ? execResult.shortMessage || 'Command failed' : ''),
          exitCode: execResult.failed || execResult.isMaxBuffer || execResult.signal
            ? execResult.exitCode || -1 : execResult.exitCode ?? -1,
        };
      } finally {
        clearTimeout(timer);
        if (cleanupTimer) clearTimeout(cleanupTimer);
        context.signal?.removeEventListener('abort', onAbort);
      }
    } catch (err: unknown) {
      if (subprocess) ownedTreeKill(subprocess);
      const error = err as { stdout?: string; stderr?: string; exitCode?: number; timedOut?: boolean; isCanceled?: boolean };
      if (error.timedOut) {
        return {
          stdout: '',
          stderr: `Command timed out after ${timeout}ms`,
          exitCode: -1,
          duration: timeout,
        };
      }
      if (error.isCanceled) {
        return {
          stdout: '',
          stderr: 'Command cancelled',
          exitCode: -1,
          duration: Date.now() - startTime,
        };
      }
      result = {
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? String(err),
        exitCode: error.exitCode ?? -1,
      };
    }

    const duration = Date.now() - startTime;
    const stdoutResult = truncateOutput(result.stdout);
    const stderrResult = truncateOutput(result.stderr);

    return {
      stdout: stdoutResult.text,
      stderr: stderrResult.text,
      exitCode: result.exitCode,
      duration,
    };
  },
};
