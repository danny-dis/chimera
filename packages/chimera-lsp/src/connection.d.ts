import { type ChildProcessWithoutNullStreams } from 'child_process';
import { type MessageConnection, type Disposable } from 'vscode-jsonrpc/node';
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
export declare class JsonRpcLspConnection implements LspConnection {
    private readonly connection;
    constructor(connection: MessageConnection);
    listen(): void;
    sendRequest<T>(method: string, params?: unknown): Promise<T>;
    sendNotification(method: string, params?: unknown): void;
    onNotification(method: string, handler: (params: unknown) => void): Disposable;
    dispose(): void;
}
export declare function createJsonRpcConnection(child: ChildProcessWithoutNullStreams): Promise<JsonRpcLspConnection>;
export declare function startLspConnection(options: LspConnectionOptions): Promise<{
    child: ChildProcessWithoutNullStreams;
    connection: LspConnection;
}>;
//# sourceMappingURL=connection.d.ts.map