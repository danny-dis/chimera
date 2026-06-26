// ---------------------------------------------------------------------------
// DaemonClient — manages the chimera-daemon subprocess and JSON-RPC calls
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

interface DaemonEvent {
  jsonrpc: '2.0';
  method: string;
  params: Record<string, unknown>;
}

export class DaemonClient {
  private process: ChildProcess | null = null;
  private buffer = '';
  private pending = new Map<string | number, PendingRequest>();
  private requestId = 0;
  private ready = false;
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private onEvent: ((type: string, data: Record<string, unknown>) => void) | null = null;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly workspaceRoot: string;

  constructor(context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel('Chimera Daemon');
    this.workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? process.cwd();

    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    context.subscriptions.push(this.outputChannel);
  }

  setEventHandler(handler: (type: string, data: Record<string, unknown>) => void): void {
    this.onEvent = handler;
  }

  async waitForReady(timeoutMs = 15000): Promise<void> {
    if (this.ready) return;
    return Promise.race([
      this.readyPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Daemon startup timed out')), timeoutMs),
      ),
    ]);
  }

  get isReady(): boolean {
    return this.ready;
  }

  async start(): Promise<void> {
    if (this.process) {
      this.log('Daemon already running');
      return;
    }

    // Reset ready state for the new process
    this.ready = false;
    this.readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
    this.buffer = '';

    // Resolve daemon path
    let daemonPath = vscode.workspace
      .getConfiguration('chimera')
      .get<string>('daemonPath', '');

    if (!daemonPath) {
      // Find the daemon in the monorepo
      const possiblePaths = [
        path.join(this.workspaceRoot, 'node_modules', '@chimera', 'daemon', 'dist', 'index.js'),
        path.join(this.workspaceRoot, '..', 'chimera-daemon', 'dist', 'index.js'),
        path.join(this.workspaceRoot, 'packages', 'chimera-daemon', 'dist', 'index.js'),
      ];

      // Also look in common parent directories
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          daemonPath = p;
          break;
        }
      }

      // Last resort: check if chimera is in a parent folder
      if (!daemonPath) {
        let dir = path.dirname(this.workspaceRoot);
        while (dir !== path.dirname(dir)) {
          const candidate = path.join(dir, 'chimera', 'packages', 'chimera-daemon', 'dist', 'index.js');
          if (fs.existsSync(candidate)) {
            daemonPath = candidate;
            break;
          }
          dir = path.dirname(dir);
        }
      }
    }

    if (!daemonPath || !fs.existsSync(daemonPath)) {
      this.log('Daemon not found. Build it with: pnpm --filter @chimera/daemon build');
      vscode.window.showWarningMessage(
        'Chimera daemon not found. Please build it first: pnpm --filter @chimera/daemon build',
      );
      return;
    }

    this.log(`Starting daemon from: ${daemonPath}`);

    this.process = spawn('node', [daemonPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    // Handle stdout (JSON-RPC responses and notifications)
    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    // Handle stderr (logs from daemon)
    this.process.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        this.log(text);
      }
    });

    // Handle exit
    this.process.on('exit', (code, signal) => {
      this.log(`Daemon exited (code: ${code}, signal: ${signal})`);
      this.process = null;
      this.ready = false;

      // Reject all pending requests
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Daemon exited (code: ${code})`));
      }
      this.pending.clear();
    });

    this.process.on('error', (err) => {
      this.log(`Daemon error: ${err.message}`);
    });
  }

  stop(): void {
    if (this.process) {
      this.log('Stopping daemon');
      this.process.stdin?.end();
      this.process.kill('SIGTERM');

      // Reject pending requests immediately
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Daemon stopped by user'));
      }
      this.pending.clear();

      this.process = null;
      this.ready = false;
      this.buffer = '';
    }
  }

  restart(): Promise<void> {
    this.stop();
    return this.start();
  }

  async call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.process?.stdin?.writable) {
      throw new Error('Daemon not running');
    }

    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out: ${method}`));
      }, 30000); // 30s timeout

      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });

      const request = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.process!.stdin!.write(request);
    }) as Promise<T>;
  }

  private processBuffer(): void {
    let newlineIdx: number;
    while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (!line) continue;

      try {
        const msg = JSON.parse(line);

        // Handle notifications (server → client events)
        if (msg.method === 'ready' && msg.jsonrpc === '2.0') {
          this.ready = true;
          this.log('Daemon ready');
          this.resolveReady();
          continue;
        }

        if (msg.method === 'event' && msg.jsonrpc === '2.0') {
          this.onEvent?.('event', msg.params);
          continue;
        }

        // Handle responses
        if (msg.jsonrpc === '2.0' && msg.id != null) {
          const pending = this.pending.get(msg.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(msg.id);

            if (msg.error) {
              pending.reject(new Error(msg.error.message));
            } else {
              pending.resolve(msg.result);
            }
          }
        }
      } catch (err) {
        this.log(`Failed to parse daemon output: ${line}`);
      }
    }
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }
}