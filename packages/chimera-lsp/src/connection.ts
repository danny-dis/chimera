import path from 'path';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import type { MessageConnection, Disposable } from 'vscode-jsonrpc/node';
import type { LspServerConfig } from './types.js';
import { ownedWindowsProcess } from './windows-owned-process.js';
import { captureLspProcessTree, terminateWindowsProcessTree } from './windows-process-tree.js';

export interface LspConnection extends Disposable {
  listen(): void;
  sendRequest<T>(method: string, params?: unknown): Promise<T>;
  sendNotification(method: string, params?: unknown): void | Promise<void>;
  onNotification(method: string, handler: (params: unknown) => void): Disposable;
}

export interface LspConnectionOptions {
  workspaceRoot: string;
  config: LspServerConfig;
  connectionFactory?: (child: ChildProcessWithoutNullStreams, config: LspServerConfig) => Promise<LspConnection>;
  requestTimeoutMs?: number;
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

  sendNotification(method: string, params?: unknown): Promise<void> {
    return this.connection.sendNotification(method, params);
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
  const { createMessageConnection, StreamMessageReader, StreamMessageWriter } = require('vscode-jsonrpc/node') as typeof import('vscode-jsonrpc/node');
  const connection = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  return new JsonRpcLspConnection(connection);
}

export async function startLspConnection(
  options: LspConnectionOptions,
): Promise<{ child: ChildProcessWithoutNullStreams; connection: LspConnection }> {
  const spawnOptions = {
    cwd: options.config.cwd ? resolveCwd(options.config.cwd, options.workspaceRoot) : options.workspaceRoot,
    env: { ...process.env, ...(options.config.env ?? {}) },
    windowsHide: true,
    shell: false,
  };
  let child: ChildProcessWithoutNullStreams;
  if (process.platform === 'win32') {
    const nodeOptionsKey = Object.keys(spawnOptions.env).find(key => key.toUpperCase() === 'NODE_OPTIONS');
    const launch = ownedWindowsProcess(options.config.command, options.config.args ?? [], false, nodeOptionsKey ? spawnOptions.env[nodeOptionsKey] : undefined);
    child = spawn(launch.command, launch.args, {
      ...spawnOptions, env: Object.fromEntries(Object.entries(spawnOptions.env).filter(([key]) => key.toUpperCase() !== 'NODE_OPTIONS')),
      stdio: ['pipe','pipe','pipe'], windowsVerbatimArguments: launch.windowsVerbatimArguments,
    });
  } else {
    child = spawn(options.config.command, options.config.args ?? [], {
      ...spawnOptions, stdio: ['pipe', 'pipe', 'pipe'],
    });
  }
  child.on('error', () => {});
  child.stderr.resume();

  // Establish listen/error/exit handling BEFORE initialization.
  // Spawn failures must settle (reject) instead of hanging or
  // surfacing as unhandled 'error' events. No request/notification
  // is sent here — the caller sends `initialize` (protocol-required)
  // only after `listen()` has been called.
  let onSpawnError: ((err: Error) => void) | undefined;
  let onEarlyExit: ((code: number | null) => void) | undefined;
  const spawnSettled = new Promise<never>((_, reject) => {
    onSpawnError = (err: Error) => reject(err);
    onEarlyExit = () => reject(new Error(`LSP server exited before connection established`));
    child.once('error', onSpawnError);
    child.once('exit', onEarlyExit);
  });
  // Avoid unhandled rejection when the factory wins the race and the
  // child later emits an unrelated error/exit.
  spawnSettled.catch(() => {});

  const timeoutMs = options.requestTimeoutMs ?? 10_000;
  let failed = false;
  let connection: LspConnection | undefined;
  const factory = options.connectionFactory ?? createJsonRpcConnection;
  let factorySettled = false;
  let lateConnection: LspConnection | undefined;
  const pending = Promise.resolve().then(() => factory(child, options.config));
  void pending.then(acquired => {
    factorySettled = true;
    lateConnection = acquired;
    if (failed) {
      try { acquired.dispose(); lateConnection = undefined; }
      catch { /* Retained by the startup error's cleanup callback. */ }
    }
  }, () => { factorySettled = true; });
  const cleanupLateConnection = async (): Promise<void> => {
    await withDeadline(pending.catch(() => undefined), timeoutMs, 'late connection cleanup');
    if (lateConnection) { lateConnection.dispose(); lateConnection = undefined; }
  };
  try {
    connection = await withDeadline(Promise.race([pending, spawnSettled]), 10_000, 'connection');
    lateConnection = undefined;
    const acquired = connection;
    connection = {
      listen: () => acquired.listen(),
      sendRequest: <T>(method: string, params?: unknown) => withDeadline(acquired.sendRequest<T>(method, params), timeoutMs, method),
      sendNotification: (method, params) => withDeadline(Promise.resolve().then(() => acquired.sendNotification(method, params)), timeoutMs, method),
      onNotification: (method, handler) => acquired.onNotification(method, handler),
      dispose: () => acquired.dispose(),
    };
    if (onSpawnError) child.removeListener('error', onSpawnError);
    if (onEarlyExit) child.removeListener('exit', onEarlyExit);
    connection.listen();
    return { child, connection };
  } catch (err) {
    failed = true;
    const lateCleanup = !connection && (!factorySettled || lateConnection) ? { cleanup: cleanupLateConnection } : {};
    if (onSpawnError) child.removeListener('error', onSpawnError);
    if (onEarlyExit) child.removeListener('exit', onEarlyExit);
    const failures: unknown[] = [err];
    let retainedConnection: LspConnection | undefined;
    try { await captureLspProcessTree(child); }
    catch (error) { failures.push(error); }
    try { connection?.dispose(); }
    catch (error) { failures.push(error); retainedConnection = connection; }
    try {
      await terminateLspProcess(child);
    } catch (error) {
      throw Object.assign(new AggregateError([...failures, error], 'LSP startup cleanup failed'), { ...lateCleanup, child, connection: retainedConnection });
    }
    if (failures.length > 1) throw Object.assign(new AggregateError(failures, 'LSP startup cleanup failed'), { ...lateCleanup, connection: retainedConnection });
    if ('cleanup' in lateCleanup) throw Object.assign(err instanceof Error ? err : new Error(String(err)), lateCleanup);
    throw err;
  }
}

async function withDeadline<T>(request: Promise<T>, timeoutMs: number, method: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`LSP ${method} timed out`)), timeoutMs);
  });
  try { return await Promise.race([request, deadline]); }
  finally { clearTimeout(timer!); }
}

export async function terminateLspProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (!child.pid) return;
  if (process.platform === 'win32' && child.spawnfile) {
    await terminateWindowsProcessTree(child);
    return;
  }
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = (): Promise<boolean> => new Promise(resolve => {
    const finish = (value: boolean) => { clearTimeout(timer); child.removeListener('exit', onExit); resolve(value); };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), 500);
    child.once('exit', onExit);
    if (child.exitCode !== null || child.signalCode !== null) finish(true);
  });
  child.kill();
  if (await exited()) return;
  child.kill('SIGKILL');
  if (!await exited()) throw new Error(`LSP child ${child.pid} did not exit`);
}

function resolveCwd(cwd: string, workspaceRoot: string): string {
  if (cwd.match(/^[A-Za-z]:[\\/]/) || cwd.startsWith('\\\\') || cwd.startsWith('/')) {
    return cwd;
  }
  return path.resolve(workspaceRoot, cwd);
}
