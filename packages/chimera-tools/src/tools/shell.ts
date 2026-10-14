import { z } from 'zod';
import type { execa } from 'execa';
import { spawnSync } from 'node:child_process';
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
 * Reap a finished/timed-out/cancelled subprocess tree by exact owned PID.
 * execa's cancelSignal/timeout only signals the direct child (cmd.exe on
 * Windows), so grandchildren are reparented and survive. On Windows we run the
 * child in its own process group (detached) and taskkill that group `/T`;
 * elsewhere we kill the owned process group. Never a global name kill.
 */
function ownedTreeKill(subprocess: { pid?: number }): void {
  const pid = subprocess.pid;
  if (pid === undefined) return;
  if (process.platform === 'win32') {
    try { spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }); }
    catch { /* best-effort reaping; the process may already be gone */ }
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
    let subprocess: ReturnType<typeof execa> | undefined;

    try {
      const { execa } = require('execa') as typeof import('execa');
      const isWindows = process.platform === 'win32';
      const shellBin = isWindows ? 'cmd.exe' : 'bash';
      const shellArgs = isWindows ? ['/c', params.command] : ['-c', params.command];
      subprocess = execa(shellBin, shellArgs, {
        cwd: workingDir,
        maxBuffer: MAX_OUTPUT_SIZE,
        env: childEnv,
        reject: false,
        windowsHide: isWindows,
        extendEnv: false,
        detached: !isWindows,
      });
      // execa only signals the direct child (cmd.exe); its descendants are
      // reparented and survive. Reap the whole owned tree by exact PID the
      // moment the shell is cancelled/timed out — before awaiting, or an
      // orphaned grandchild holding the stdout pipe blocks the await.
      // We do NOT pass execa's own `timeout` option: it would kill cmd.exe
      // at `timeout` ms, before this timer fires at `timeout + 150`, losing
      // the shell PID and leaving descendants unreapable. This timer is the
      // single deadline owner.
      let cancelled = context.signal?.aborted ?? false;
      let timedOut = false;
      const treeKill = () => ownedTreeKill(subprocess!);
      const onAbort = () => { cancelled = true; treeKill(); };
      if (context.signal && !cancelled) {
        context.signal.addEventListener('abort', onAbort, { once: true });
      }
      const timer = setTimeout(() => { timedOut = true; treeKill(); }, timeout + 150);
      try {
        const execResult = (await subprocess) as {
          stdout: string;
          stderr: string;
          exitCode?: number;
          isCanceled?: boolean;
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
          stderr: execResult.stderr,
          exitCode: execResult.exitCode ?? 0,
        };
      } finally {
        clearTimeout(timer);
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
