/**
 * MCP (Model Context Protocol) Client — connects to MCP servers
 * and exposes their tools as Chimera tools.
 */
import type { ToolDefinition } from './tool-schema.js';
export interface McpServerConfig {
    name: string;
    transport: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
}
interface McpTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}
/**
 * MCP Client — manages connection to an MCP server and adapts its tools.
 */
export declare class McpClient {
    private server;
    private process;
    private messageId;
    private pending;
    private tools;
    private connected;
    constructor(server: McpServerConfig);
    /**
     * Connect to the MCP server and discover available tools.
     */
    connect(): Promise<void>;
    /**
     * Get the list of tools discovered from the server.
     */
    getTools(): McpTool[];
    /**
     * Call a tool on the MCP server.
     */
    callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
    /**
     * Disconnect from the MCP server.
     */
    disconnect(): Promise<void>;
    isConnected(): boolean;
    /**
     * Convert MCP tools into Chimera ToolDefinitions.
     */
    toToolDefinitions(): ToolDefinition[];
    private adaptTool;
    private buildZodSchema;
    private sendRequest;
    private sendNotification;
    private sendMessage;
    private handleMessage;
}
/**
 * MCP Client Manager — manages multiple MCP server connections.
 */
export declare class McpManager {
    private clients;
    /**
     * Connect to an MCP server and register its tools.
     */
    addServer(config: McpServerConfig): Promise<ToolDefinition[]>;
    /**
     * Disconnect from an MCP server.
     */
    removeServer(name: string): Promise<void>;
    /**
     * Get all connected clients.
     */
    getClients(): Map<string, McpClient>;
    /**
     * Disconnect all servers.
     */
    disconnectAll(): Promise<void>;
}
export {};
//# sourceMappingURL=mcp-client.d.ts.map