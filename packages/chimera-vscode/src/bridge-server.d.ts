/**
 * BridgeServer — HTTP server for IDE ↔ Chimera communication.
 *
 * Provides REST endpoints for session creation, message passing,
 * and file change notifications. Alternative to the stdio-based
 * DaemonClient for tools that prefer HTTP.
 *
 * Endpoints:
 *   POST /session          — create a new session
 *   POST /session/:id/send — send a message to a session
 *   GET  /session/:id      — get session status
 *   POST /file-changed     — notify about file changes
 *   GET  /health           — health check
 */
export interface BridgeServerConfig {
    port: number;
    host?: string;
}
export interface BridgeSession {
    id: string;
    mode: string;
    workspaceRoot: string;
    messages: Array<{
        role: string;
        content: string;
        timestamp: number;
    }>;
    status: 'active' | 'completed' | 'failed';
    createdAt: number;
}
export interface BridgeTaskRequest {
    task: string;
    mode?: string;
    workspaceRoot?: string;
}
export type BridgeTaskHandler = (params: {
    task: string;
    mode: string;
    workspaceRoot: string;
    sessionId: string;
}) => Promise<{
    status: string;
    output: string;
    cost: number;
}>;
export declare class BridgeServer {
    private server;
    private config;
    private sessions;
    private taskHandler;
    private fileChangeNotifications;
    private maxNotifications;
    constructor(config: BridgeServerConfig, taskHandler: BridgeTaskHandler);
    start(): Promise<void>;
    stop(): Promise<void>;
    getPort(): number;
    isRunning(): boolean;
    private handleRequest;
    private createSession;
    private readBody;
    private json;
}
//# sourceMappingURL=bridge-server.d.ts.map