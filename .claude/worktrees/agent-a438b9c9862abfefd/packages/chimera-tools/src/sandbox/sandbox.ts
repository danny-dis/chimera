import { z } from 'zod';
import { execa } from 'execa';
import os from 'node:os';
import { PTYExecutor } from './pty-executor.js';
import { EnvironmentFilter } from './env-filter.js';

const SandboxTierSchema = z.enum(['process', 'os', 'container']);

const SandboxConfigSchema = z.object({
  tier: SandboxTierSchema,
  workspaceRoot: z.string(),
  networkEgress: z.boolean().optional(),
  maxMemoryMB: z.number().optional(),
  timeoutMs: z.number().optional(),
  envFilter: z.array(z.string()).optional(),
});

export type SandboxTier = z.infer<typeof SandboxTierSchema>;
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

export interface SandboxExecuteOptions {
  cwd?: string;
  timeoutMs?: number;
  maxMemoryMB?: number;
  networkEgress?: boolean;
  env?: Record<string, string>;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  killed: boolean;
  oom: boolean;
}

export class Sandbox {
  private config: Required<SandboxConfig>;
  private envFilter: EnvironmentFilter;
  private ptyExecutor: PTYExecutor;
  private destroyed = false;

  constructor(config: SandboxConfig) {
    const validated = SandboxConfigSchema.parse(config);
    this.config = {
      tier: validated.tier,
      workspaceRoot: validated.workspaceRoot,
      networkEgress: validated.networkEgress ?? false,
      maxMemoryMB: validated.maxMemoryMB ?? 512,
      timeoutMs: validated.timeoutMs ?? 30_000,
      envFilter: validated.envFilter ?? [],
    };
    this.envFilter = new EnvironmentFilter({ allowedVars: this.config.envFilter });
    this.ptyExecutor = new PTYExecutor({
      workspaceRoot: this.config.workspaceRoot,
      defaultTimeout: this.config.timeoutMs,
    });
  }

  async execute(
    command: string,
    options?: SandboxExecuteOptions,
  ): Promise<SandboxResult> {
    if (this.destroyed) {
      throw new Error('Sandbox has been destroyed');
    }

    const timeout = options?.timeoutMs ?? this.config.timeoutMs;
    const maxMemoryMB = options?.maxMemoryMB ?? this.config.maxMemoryMB;
    const networkEgress = options?.networkEgress ?? this.config.networkEgress;
    const cwd = options?.cwd ?? this.config.workspaceRoot;
    const env = this.buildEnv(options?.env);

    const startTime = Date.now();

    try {
      switch (this.config.tier) {
        case 'process':
          return this.executeProcessTier(command, { cwd, timeout, maxMemoryMB, networkEgress, env });
        case 'os':
          return this.executeOSTier(command, { cwd, timeout, maxMemoryMB, networkEgress, env });
        case 'container':
          return this.executeContainerTier(command, { cwd, timeout, maxMemoryMB, networkEgress, env });
        default:
          throw new Error(`Unknown sandbox tier: ${this.config.tier}`);
      }
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('ENOMEM') || message.includes('out of memory')) {
        return {
          stdout: '',
          stderr: message,
          exitCode: 137,
          duration,
          killed: false,
          oom: true,
        };
      }

      if (error instanceof Error && 'signal' in error && (error as { signal: string }).signal === 'SIGTERM') {
        return {
          stdout: '',
          stderr: 'Process killed by timeout',
          exitCode: 124,
          duration,
          killed: true,
          oom: false,
        };
      }

      return {
        stdout: '',
        stderr: message,
        exitCode: 1,
        duration,
        killed: false,
        oom: false,
      };
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.ptyExecutor.kill();
  }

  private buildEnv(extraEnv?: Record<string, string>): Record<string, string> {
    const filtered = this.envFilter.filter(process.env as Record<string, string>);
    return { ...filtered, ...(extraEnv ?? {}) };
  }

  private async executeProcessTier(
    command: string,
    options: { cwd: string; timeout: number; maxMemoryMB: number; networkEgress: boolean; env: Record<string, string> },
  ): Promise<SandboxResult> {
    const startTime = Date.now();
    const ulimitCmd = `ulimit -v ${options.maxMemoryMB * 1024} 2>/dev/null; `;
    const networkBlock = options.networkEgress
      ? ''
      : 'export http_proxy=http://127.0.0.1:1; export https_proxy=http://127.0.0.1:1; ';

    const fullCommand = `${networkBlock}${ulimitCmd}${command}`;

    try {
      const result = await execa('bash', ['-c', fullCommand], {
        cwd: options.cwd,
        timeout: options.timeout,
        env: options.env,
        reject: false,
        killSignal: 'SIGTERM',
      });

      const execaResult = result as unknown as {
        stdout: string;
        stderr: string;
        exitCode: number | null;
        failed: boolean;
        isTerminated: boolean;
        timedOut: boolean;
        killed: boolean;
        signal?: string;
      };

      const wasKilled = execaResult.killed === true
        || execaResult.timedOut === true
        || execaResult.isTerminated === true
        || execaResult.signal === 'SIGTERM'
        || execaResult.signal === 'SIGKILL';

      const wasTimeout = execaResult.timedOut === true;

      return {
        stdout: execaResult.stdout,
        stderr: execaResult.stderr,
        exitCode: wasTimeout ? 124 : (execaResult.exitCode ?? 0),
        duration: Date.now() - startTime,
        killed: wasKilled,
        oom: execaResult.exitCode === 137,
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const execaError = error as {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
        signal?: string;
        killed?: boolean;
        shortMessage?: string;
        originalMessage?: string;
        message?: string;
      };

      const errorMsg = [
        execaError.shortMessage,
        execaError.originalMessage,
        execaError.message,
      ].filter(Boolean).join(' ').toLowerCase();

      const wasTimeout = errorMsg.includes('timed out') || errorMsg.includes('timeout');
      const wasKilled = execaError.killed === true
        || execaError.signal === 'SIGTERM'
        || execaError.signal === 'SIGKILL'
        || wasTimeout;

      return {
        stdout: execaError.stdout ?? '',
        stderr: execaError.stderr ?? String(error),
        exitCode: wasTimeout ? 124 : (execaError.exitCode ?? 1),
        duration,
        killed: wasKilled,
        oom: execaError.exitCode === 137,
      };
    }
  }

  private async executeOSTier(
    command: string,
    options: { cwd: string; timeout: number; maxMemoryMB: number; networkEgress: boolean; env: Record<string, string> },
  ): Promise<SandboxResult> {
    const platform = os.platform();

    if (platform === 'darwin') {
      return this.executeMacOSSandbox(command, options);
    }

    if (platform === 'linux') {
      return this.executeLinuxSandbox(command, options);
    }

    return this.executeProcessTier(command, options);
  }

  private async executeMacOSSandbox(
    command: string,
    options: { cwd: string; timeout: number; maxMemoryMB: number; networkEgress: boolean; env: Record<string, string> },
  ): Promise<SandboxResult> {
    const networkRule = options.networkEgress
      ? '(allow network-outbound)'
      : '(deny network-outbound)';

    const profile = `(version 1)
(deny default)
(allow file-read*)
(allow file-write* (subpath "${options.cwd}"))
(allow process-exec)
${networkRule}
(allow sysctl-read)`;

    const profilePath = `/tmp/chimera-sandbox-${Date.now()}.sb`;
    try {
      await execa('bash', ['-c', `echo '${profile.replace(/'/g, "'\"'\"'")}' > ${profilePath}`]);

      const result = await execa('sandbox-exec', ['-f', profilePath, 'bash', '-c', command], {
        cwd: options.cwd,
        timeout: options.timeout,
        env: options.env,
        reject: false,
        killSignal: 'SIGTERM',
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode ?? 0,
        duration: 0,
        killed: false,
        oom: result.exitCode === 137,
      };
    } catch {
      return this.executeProcessTier(command, options);
    } finally {
      try {
        await execa('rm', ['-f', profilePath]);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  private async executeLinuxSandbox(
    command: string,
    options: { cwd: string; timeout: number; maxMemoryMB: number; networkEgress: boolean; env: Record<string, string> },
  ): Promise<SandboxResult> {
    try {
      const bwrapArgs = [
        '--bind', '/', '/',
        '--bind', options.cwd, options.cwd,
        '--die-with-parent',
        '--unshare-net',
        '--unshare-ipc',
        '--proc', '/proc',
        '--dev', '/dev',
      ];

      if (!options.networkEgress) {
        bwrapArgs.push('--unshare-net');
      }

      const result = await execa('bwrap', [...bwrapArgs, '--', 'bash', '-c', command], {
        cwd: options.cwd,
        timeout: options.timeout,
        env: options.env,
        reject: false,
        killSignal: 'SIGTERM',
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode ?? 0,
        duration: 0,
        killed: false,
        oom: result.exitCode === 137,
      };
    } catch {
      return this.executeProcessTier(command, options);
    }
  }

  private async executeContainerTier(
    command: string,
    options: { cwd: string; timeout: number; maxMemoryMB: number; networkEgress: boolean; env: Record<string, string> },
  ): Promise<SandboxResult> {
    const containerName = `chimera-sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const networkFlag = options.networkEgress ? '--network=bridge' : '--network=none';
    const memoryFlag = `--memory=${options.maxMemoryMB}m`;
    const mountMode = 'ro';

    try {
      const runResult = await execa('docker', [
        'run', '--rm',
        '--name', containerName,
        networkFlag,
        memoryFlag,
        '--memory-swap', `${options.maxMemoryMB}m`,
        '--cpus', '1',
        '-v', `${this.config.workspaceRoot}:/workspace:${mountMode}`,
        '-w', '/workspace',
        '--timeout', Math.ceil(options.timeout / 1000).toString(),
        'alpine:latest',
        'sh', '-c', command,
      ], {
        timeout: options.timeout + 5000,
        env: options.env,
        reject: false,
        killSignal: 'SIGTERM',
      });

      return {
        stdout: runResult.stdout,
        stderr: runResult.stderr,
        exitCode: runResult.exitCode ?? 0,
        duration: 0,
        killed: false,
        oom: runResult.exitCode === 137,
      };
    } catch {
      return {
        stdout: '',
        stderr: 'Docker not available or container execution failed',
        exitCode: 1,
        duration: 0,
        killed: false,
        oom: false,
      };
    }
  }
}
