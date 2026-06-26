import { z } from 'zod';
import { execa } from 'execa';
import path from 'node:path';

const PTYOptionsSchema = z.object({
  command: z.string(),
  cwd: z.string(),
  timeout: z.number(),
  env: z.record(z.string()),
  maxOutputBytes: z.number().optional(),
});

export interface PTYOptions {
  command: string;
  cwd: string;
  timeout: number;
  env: Record<string, string>;
  maxOutputBytes?: number;
}

export class PTYExecutor {
  private workspaceRoot: string;
  private currentProcess: ReturnType<typeof execa> | null = null;

  constructor(options: { workspaceRoot: string; defaultTimeout: number }) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
  }

  async execute(options: PTYOptions): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    duration: number;
  }> {
    const validated = PTYOptionsSchema.parse({
      ...options,
      maxOutputBytes: options.maxOutputBytes ?? 10 * 1024 * 1024,
    });

    const resolvedCwd = path.resolve(validated.cwd);
    if (!resolvedCwd.startsWith(this.workspaceRoot)) {
      throw new Error(`Working directory ${resolvedCwd} is outside workspace ${this.workspaceRoot}`);
    }

    const maxOutputBytes = validated.maxOutputBytes ?? 10 * 1024 * 1024;
    const startTime = Date.now();

    this.currentProcess = execa('bash', ['-c', validated.command], {
      cwd: resolvedCwd,
      timeout: validated.timeout,
      env: validated.env,
      reject: false,
      killSignal: 'SIGTERM',
      maxBuffer: maxOutputBytes + 1024,
    });

    try {
      const result = await this.currentProcess;
      const duration = Date.now() - startTime;

      const stdout = this.truncateOutput(String(result.stdout ?? ''), maxOutputBytes);
      const stderr = this.truncateOutput(String(result.stderr ?? ''), maxOutputBytes);

      return {
        stdout,
        stderr,
        exitCode: result.exitCode ?? 0,
        duration,
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const execaError = error as {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
        signal?: string;
        killed?: boolean;
        originalMessage?: string;
      };

      const stdout = this.truncateOutput(execaError.stdout ?? '', maxOutputBytes);
      const stderr = this.truncateOutput(execaError.stderr ?? String(error), maxOutputBytes);

      const wasTruncated = (execaError.originalMessage?.includes('maxBuffer') ?? false)
        || Buffer.byteLength(execaError.stdout ?? '', 'utf8') >= maxOutputBytes;

      const finalStdout = wasTruncated && !stdout.includes('truncated')
        ? `${stdout}\n... [output truncated, exceeded ${maxOutputBytes} bytes]`
        : stdout;

      return {
        stdout: finalStdout,
        stderr,
        exitCode: execaError.exitCode ?? 1,
        duration,
      };
    } finally {
      this.currentProcess = null;
    }
  }

  kill(): void {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
  }

  private truncateOutput(output: string, maxBytes: number): string {
    if (Buffer.byteLength(output, 'utf8') <= maxBytes) {
      return output;
    }

    const truncated = output.slice(0, maxBytes);
    const lastNewline = truncated.lastIndexOf('\n');
    return lastNewline > 0
      ? `${truncated.slice(0, lastNewline)}\n... [output truncated, exceeded ${maxBytes} bytes]`
      : `${truncated}\n... [output truncated, exceeded ${maxBytes} bytes]`;
  }
}
