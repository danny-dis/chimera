import path from 'path';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { createMessageConnection, type MessageConnection, type Disposable } from 'vscode-jsonrpc/node';
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import type { LspServerConfig } from './types.js';

export interface LspConnection extends Disposable {
  listen(): void;
  sendRequest<T>(method: string, params?: unknown): Promise<T>;
  sendNotification(method: string, params?: unknown): void;
  onNotification(method: string, handler: (params: unknown) => void): Disposable;
}

export interface LspConnectionOptions {
  workspaceRoot: string;
  config: LspServerConfig;
  connectionFactory?: (child: ChildProcessWithoutNullStreams, config: LspServerConfig) => Promise<LspConnection>;
}

export class JsonRpcLspConnection implements LspConnection {
  private readonly connection: MessageConnection;

  constructor(connection: MessageConnection) {
    this.connection = connection;
  }

  listen(): void {
    this.connection.listen();
  }

  sendRequest<T>(method: string, params?: unknown): Promise<T> {
    return this.connection.sendRequest(method, params) as Promise<T>;
  }

  sendNotification(method: string, params?: unknown): void {
    this.connection.sendNotification(method, params);
  }

  onNotification(method: string, handler: (params: unknown) => void): Disposable {
    return this.connection.onNotification(method, handler);
  }

  dispose(): void {
    this.connection.dispose();
  }
}

export async function createJsonRpcConnection(
  child: ChildProcessWithoutNullStreams,
): Promise<JsonRpcLspConnection> {
  const connection = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  return new JsonRpcLspConnection(connection);
}

export async function startLspConnection(
  options: LspConnectionOptions,
): Promise<{ child: ChildProcessWithoutNullStreams; connection: LspConnection }> {
  const isWindows = process.platform === 'win32';
  const child = spawn(options.config.command, options.config.args ?? [], {
    cwd: options.config.cwd ? resolveCwd(options.config.cwd, options.workspaceRoot) : options.workspaceRoot,
    env: { ...process.env, ...(options.config.env ?? {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    shell: isWindows,
  });

  const factory = options.connectionFactory ?? createJsonRpcConnection;
  const connection = await factory(child, options.config);
  connection.listen();
  return { child, connection };
}

function resolveCwd(cwd: string, workspaceRoot: string): string {
  if (cwd.match(/^[A-Za-z]:[\\/]/) || cwd.startsWith('\\\\') || cwd.startsWith('/')) {
    return cwd;
  }
  return path.resolve(workspaceRoot, cwd);
}
