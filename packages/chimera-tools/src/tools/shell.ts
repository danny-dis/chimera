import { z } from 'zod';
import { execa } from 'execa';
import path from 'path';
import type { ToolDefinition, ToolContext } from '../tool-schema.js';
import { MAX_OUTPUT_SIZE, DEFAULT_SHELL_TIMEOUT, MAX_SHELL_TIMEOUT } from '../tool-schema.js';

// ── Dangerous command patterns ───────────────────────────────────────────────

const DANGEROUS_PATTERNS = [
  /^\s*rm\s+(-rf?|--force)\s+\/\s*$/,
  /^\s*rm\s+(-rf?|--force)\s+\/\s*;/,
  /^\s*rm\s+(-rf?|--force)\s+\/\s*\|/,
  /^\s*>\s*\/dev\/(sda|sdb|sdc)/,
  /^\s*dd\s+.*of=\/dev\/sd/,
  /^\s*mkfs/,
  /^\s*:\(\)\{\s*:\|:\s*&\s*\}\s*;/,  // fork bomb
  /^\s*chmod\s+777\s+\/\s*$/,
  /^\s*chmod\s+-R\s+777\s+\/\s*$/,
  /^\s*sudo\s+rm\s+(-rf?|--force)\s+\/\s*$/,
  /^\s*mv\s+.*\/dev\/null/,
  /^\s*shred\s+/,
];

function isDangerous(command: string): boolean {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) return true;
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

const SAFE_ENV_BLOCKLIST = [
  'AWS_SECRET_ACCESS_KEY',
  'AWS_ACCESS_KEY_ID',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'NPM_TOKEN',
  'PRIVATE_KEY',
  'DATABASE_URL',
  'API_KEY',
  'SECRET',
  'PASSWORD',
];

function filterEnv(env: Record<string, string> = {}): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const upper = key.toUpperCase();
    const blocked = SAFE_ENV_BLOCKLIST.some((blocked) => upper.includes(blocked));
    if (!blocked) {
      filtered[key] = value;
    }
  }
  return filtered;
}

// ── run_shell_command ────────────────────────────────────────────────────────

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

    const timeout = Math.min(params.timeout, MAX_SHELL_TIMEOUT);
    const workingDir = params.cwd
      ? path.resolve(context.workspaceRoot, params.cwd)
      : context.workspaceRoot;

    if (!workingDir.startsWith(path.resolve(context.workspaceRoot))) {
      throw new Error(`Working directory escapes workspace root: ${params.cwd}`);
    }

    const filteredEnv = filterEnv(params.env);

    const startTime = Date.now();

    let result: { stdout: string; stderr: string; exitCode: number };

    try {
      const isWindows = process.platform === 'win32';
      const shellBin = isWindows ? 'cmd.exe' : 'bash';
      const shellArgs = isWindows ? ['/c', params.command] : ['-c', params.command];
      const execResult = await execa(shellBin, shellArgs, {
        cwd: workingDir,
        timeout,
        maxBuffer: MAX_OUTPUT_SIZE,
        env: filteredEnv,
        reject: false,
        windowsHide: isWindows,
      });
      result = {
        stdout: execResult.stdout,
        stderr: execResult.stderr,
        exitCode: execResult.exitCode ?? 0,
      };
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; exitCode?: number; timedOut?: boolean };
      if (error.timedOut) {
        return {
          stdout: '',
          stderr: `Command timed out after ${timeout}ms`,
          exitCode: -1,
          duration: timeout,
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
