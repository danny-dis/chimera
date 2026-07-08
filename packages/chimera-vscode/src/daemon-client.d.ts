import * as vscode from 'vscode';
export declare class DaemonClient {
    private process;
    private buffer;
    private pending;
    private requestId;
    private ready;
    private readyPromise;
    private resolveReady;
    private onEvent;
    private readonly outputChannel;
    private readonly workspaceRoot;
    constructor(context: vscode.ExtensionContext);
    setEventHandler(handler: (type: string, data: Record<string, unknown>) => void): void;
    waitForReady(timeoutMs?: number): Promise<void>;
    get isReady(): boolean;
    start(): Promise<void>;
    stop(): void;
    restart(): Promise<void>;
    call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
    private processBuffer;
    private log;
}
//# sourceMappingURL=daemon-client.d.ts.map