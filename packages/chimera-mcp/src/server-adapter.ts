// =============================================================================
// McpServerAdapter — connects to MCP servers, discovers tools/resources/prompts,
// and provides a unified interface for tool execution.
// =============================================================================

import type {
  McpServerConfig,
  McpTool,
  McpToolCall,
  McpToolResult,
  McpResource,
  McpPrompt,
} from './types.js';

/**
 * Connection state for an MCP server
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * MCP Server Adapter — manages connection to a single MCP server.
 * 
 * Supports stdio, SSE, and HTTP transports. Discovers tools, resources,
 * and prompts on connection. Provides a unified tool execution interface.
 */
export class McpServerAdapter {
  readonly config: McpServerConfig;
  private _state: ConnectionState = 'disconnected';
  private _tools: Map<string, McpTool> = new Map();
  private _resources: Map<string, McpResource> = new Map();
  private _prompts: Map<string, McpPrompt> = new Map();
  private _error: string | null = null;

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  // --- State ---

  get state(): ConnectionState {
    return this._state;
  }

  get isConnected(): boolean {
    return this._state === 'connected';
  }

  get error(): string | null {
    return this._error;
  }

  // --- Discovery ---

  get tools(): McpTool[] {
    return [...this._tools.values()];
  }

  get resources(): McpResource[] {
    return [...this._resources.values()];
  }

  get prompts(): McpPrompt[] {
    return [...this._prompts.values()];
  }

  getTool(name: string): McpTool | undefined {
    return this._tools.get(name);
  }

  getResource(uri: string): McpResource | undefined {
    return this._resources.get(uri);
  }

  getPrompt(name: string): McpPrompt | undefined {
    return this._prompts.get(name);
  }

  // --- Connection ---

  /**
   * Connect to the MCP server and discover capabilities.
   * In a real implementation, this would establish the transport
   * connection and send the MCP initialize request.
   */
  async connect(): Promise<void> {
    this._state = 'connecting';
    this._error = null;

    try {
      // Simulate connection — in production this would:
      // 1. Spawn stdio process or open SSE/HTTP connection
      // 2. Send MCP initialize request
      // 3. Handle server response
      await this.simulateConnection();

      this._state = 'connected';

      if (this.config.autoDiscover) {
        await this.discoverTools();
        await this.discoverResources();
        await this.discoverPrompts();
      }
    } catch (err) {
      this._state = 'error';
      this._error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /**
   * Disconnect from the server.
   */
  async disconnect(): Promise<void> {
    this._state = 'disconnected';
    this._tools.clear();
    this._resources.clear();
    this._prompts.clear();
  }

  /**
   * Reconnect (disconnect + connect).
   */
  async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  // --- Tool Execution ---

  /**
   * Execute a tool on this server.
   */
  async executeTool(call: McpToolCall): Promise<McpToolResult> {
    if (!this.isConnected) {
      return {
        success: false,
        error: `Server ${this.config.id} is not connected (state: ${this._state})`,
        durationMs: 0,
        serverId: this.config.id,
      };
    }

    const tool = this._tools.get(call.toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${call.toolName}' not found on server ${this.config.id}`,
        durationMs: 0,
        serverId: this.config.id,
      };
    }

    // Validate input against schema
    const validation = this.validateInput(call.arguments, tool.inputSchema);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid input: ${validation.error}`,
        durationMs: 0,
        serverId: this.config.id,
      };
    }

    const startTime = Date.now();
    try {
      // In production: send tools/call JSON-RPC request
      const result = await this.sendToolCall(call);
      return {
        success: true,
        data: result,
        durationMs: Date.now() - startTime,
        serverId: this.config.id,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
        serverId: this.config.id,
      };
    }
  }

  // --- Permission Mapping ---

  /**
   * Map an MCP tool to a Chimera permission level.
   */
  getPermissionLevel(toolName: string): 'read' | 'write' | 'execute' {
    const tool = this._tools.get(toolName);
    if (!tool) return 'read';

    switch (tool.category) {
      case 'filesystem':
        // Read-only filesystem tools are read, write/delete are write
        if (/read|get|list|search/i.test(toolName)) return 'read';
        return 'write';
      case 'shell':
        return 'execute';
      case 'git':
        if (/status|log|diff|show/i.test(toolName)) return 'read';
        return 'write';
      case 'network':
        return 'execute';
      case 'browser':
        return 'execute';
      case 'lsp':
        return 'read';
      case 'mcp':
        return 'read';
      case 'internal':
        return 'read';
      default:
        return 'read';
    }
  }

  // --- Testing ---

  /**
   * Register a tool directly (for testing).
   */
  registerTestTool(tool: McpTool): void {
    this._tools.set(tool.name, tool);
  }

  // --- Private ---

  private async simulateConnection(): Promise<void> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  private async discoverTools(): Promise<void> {
    // In production: send tools/list JSON-RPC request
    // For now, tools are empty until a real connection is made
  }

  private async discoverResources(): Promise<void> {
    // In production: send resources/list JSON-RPC request
  }

  private async discoverPrompts(): Promise<void> {
    // In production: send prompts/list JSON-RPC request
  }

  private validateInput(
    input: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): { valid: boolean; error?: string } {
    // Basic validation — in production, use a full JSON Schema validator
    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (!(field in input)) {
          return { valid: false, error: `Missing required field: ${field}` };
        }
      }
    }
    return { valid: true };
  }

  private async sendToolCall(call: McpToolCall): Promise<Record<string, unknown>> {
    // In production: send tools/call JSON-RPC request
    return { result: `Executed ${call.toolName} on ${this.config.id}` };
  }
}

/**
 * McpRegistry — manages multiple MCP server connections.
 */
export class McpRegistry {
  private servers = new Map<string, McpServerAdapter>();

  /**
   * Register an MCP server configuration.
   */
  registerServer(config: McpServerConfig): McpServerAdapter {
    const adapter = new McpServerAdapter(config);
    this.servers.set(config.id, adapter);
    return adapter;
  }

  /**
   * Unregister a server.
   */
  unregisterServer(serverId: string): void {
    const server = this.servers.get(serverId);
    if (server) {
      server.disconnect();
      this.servers.delete(serverId);
    }
  }

  /**
   * Get a server adapter by ID.
   */
  getServer(serverId: string): McpServerAdapter | undefined {
    return this.servers.get(serverId);
  }

  /**
   * Get all registered servers.
   */
  getAllServers(): McpServerAdapter[] {
    return [...this.servers.values()];
  }

  /**
   * Get all tools from all connected servers.
   */
  getAllTools(): McpTool[] {
    const tools: McpTool[] = [];
    for (const server of this.servers.values()) {
      if (server.isConnected) {
        tools.push(...server.tools);
      }
    }
    return tools;
  }

  /**
   * Find a tool by name across all servers.
   */
  findTool(toolName: string): { server: McpServerAdapter; tool: McpTool } | null {
    for (const server of this.servers.values()) {
      const tool = server.getTool(toolName);
      if (tool) {
        return { server, tool };
      }
    }
    return null;
  }

  /**
   * Connect to all registered servers.
   */
  async connectAll(): Promise<void> {
    const promises = [...this.servers.values()].map(server =>
      server.connect().catch(err => {
        console.error(`Failed to connect to MCP server ${server.config.id}:`, err);
      }),
    );
    await Promise.all(promises);
  }

  /**
   * Disconnect from all servers.
   */
  async disconnectAll(): Promise<void> {
    for (const server of this.servers.values()) {
      await server.disconnect();
    }
  }
}
