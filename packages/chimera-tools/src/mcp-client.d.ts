/**
 * MCP (Model Context Protocol) Client — connects to MCP servers
 * and exposes their tools as Chimera tools.
 *
 * Supports stdio and Streamable HTTP transports, config file loading,
 * health monitoring, auto-reconnect, and tool filtering.
 */
import type { ToolDefinition } from './tool-schema.js';
export interface McpServerConfig {
    name: string;
    transport: 'stdio' | 'sse' | 'http';
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    enabled?: boolean;
    includeTools?: string[];
    excludeTools?: string[];
}
export interface McpConfigFile {
    mcpServers: Record<string, Omit<McpServerConfig, 'name'>>;
}
interface McpTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}
export interface McpResource {
    uri: string;
    name: string;
    mimeType?: string;
}
export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
/**
 * MCP Client — manages connection to an MCP server and adapts its tools.
 */
export declare class McpClient {
    private server;
    private process;
    private messageId;
    private pending;
    private tools;
    private resources;
    private connected;
    private status;
    private statusListeners;
    constructor(server: McpServerConfig);
    onStatusChange(listener: (status: McpConnectionStatus) => void): () => void;
    getStatus(): McpConnectionStatus;
    setStatus(status: McpConnectionStatus): void;
    /**
     * Connect to the MCP server and discover available tools.
     */
    connect(): Promise<void>;
    private connectStdio;
    private connectHttp;
    getTools(): McpTool[];
    getResources(): McpResource[];
    readResource(uri: string): Promise<unknown>;
    callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    /**
     * Convert MCP tools into Chimera ToolDefinitions, filtered by include/exclude lists.
     */
    toToolDefinitions(): ToolDefinition[];
    private isToolAllowed;
    private adaptTool;
    private buildZodSchema;
    private sendRequest;
    private sendNotification;
    private sendMessage;
    private handleMessage;
}
/**
 * MCP Client Manager — manages multiple MCP server connections
 * with health monitoring and auto-reconnect.
 */
export declare class McpManager {
    private clients;
    private configs;
    private healthTimers;
    private reconnectAttempts;
    addServer(config: McpServerConfig, options?: {
        skipDisabled?: boolean;
    }): Promise<ToolDefinition[]>;
    removeServer(name: string): Promise<void>;
    getClients(): Map<string, McpClient>;
    getAllTools(): ToolDefinition[];
    disconnectAll(): Promise<void>;
    private startHealthCheck;
    private stopHealthCheck;
    private scheduleReconnect;
    /**
     * Load MCP config from a .mcp.json file.
     */
    static loadConfigFile(config: McpConfigFile): McpServerConfig[];
}
export {};
//# sourceMappingURL=mcp-client.d.ts.map