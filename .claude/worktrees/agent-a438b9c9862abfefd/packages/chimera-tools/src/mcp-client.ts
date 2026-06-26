/**
 * MCP (Model Context Protocol) Client — connects to MCP servers
 * and exposes their tools as Chimera tools.
 */

import { spawn, type ChildProcess } from 'child_process';
import { z } from 'zod';
import type { ToolDefinition, ToolContext } from './tool-schema.js';

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

interface McpMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * MCP Client — manages connection to an MCP server and adapts its tools.
 */
export class McpClient {
  private server: McpServerConfig;
  private process: ChildProcess | null = null;
  private messageId = 0;
  private pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }>();
  private tools: McpTool[] = [];
  private connected = false;

  constructor(server: McpServerConfig) {
    this.server = server;
  }

  /**
   * Connect to the MCP server and discover available tools.
   */
  async connect(): Promise<void> {
    if (this.server.transport !== 'stdio') {
      throw new Error(`Transport "${this.server.transport}" not yet supported. Use "stdio".`);
    }

    if (!this.server.command) {
      throw new Error('stdio transport requires a "command" field');
    }

    return new Promise((resolve, reject) => {
      this.process = spawn(this.server.command!, this.server.args ?? [], {
        env: { ...process.env, ...this.server.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let buffer = '';

      this.process.stdout?.on('data', (data: Buffer) => {
        buffer += data.toString();
        // MCP uses newline-delimited JSON
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) {
            this.handleMessage(JSON.parse(line));
          }
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        // Log stderr but don't fail
        console.error(`[mcp:${this.server.name}] ${data.toString().trim()}`);
      });

      this.process.on('error', (err) => {
        this.connected = false;
        reject(new Error(`MCP server "${this.server.name}" failed to start: ${err.message}`));
      });

      this.process.on('exit', (code) => {
        this.connected = false;
        if (code !== 0 && code !== null) {
          console.error(`[mcp:${this.server.name}] exited with code ${code}`);
        }
      });

      // Initialize: send initialize request
      this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'chimera', version: '1.0.0' },
      }).then(async () => {
        // Send initialized notification
        this.sendNotification('notifications/initialized', {});
        // List tools
        const result = await this.sendRequest('tools/list', {}) as { tools?: McpTool[] };
        this.tools = result.tools ?? [];
        this.connected = true;
        resolve();
      }).catch(reject);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error(`MCP server "${this.server.name}" connection timed out`));
        }
      }, 10_000);
    });
  }

  /**
   * Get the list of tools discovered from the server.
   */
  getTools(): McpTool[] {
    return [...this.tools];
  }

  /**
   * Call a tool on the MCP server.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      throw new Error(`Not connected to MCP server "${this.server.name}"`);
    }
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  /**
   * Disconnect from the MCP server.
   */
  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Convert MCP tools into Chimera ToolDefinitions.
   */
  toToolDefinitions(): ToolDefinition[] {
    return this.tools.map((mcpTool) => this.adaptTool(mcpTool));
  }

  private adaptTool(mcpTool: McpTool): ToolDefinition {
    // Build a Zod schema from the MCP input schema
    const schema = this.buildZodSchema(mcpTool.inputSchema);

    return {
      name: `mcp_${this.server.name}_${mcpTool.name}`,
      description: `[MCP:${this.server.name}] ${mcpTool.description}`,
      parameters: schema,
      returns: z.object({
        content: z.unknown(),
        isError: z.boolean().optional(),
      }),
      category: 'mcp',
      permissionLevel: 'execute',
      execute: async (params: Record<string, unknown>, _context: ToolContext): Promise<Record<string, unknown>> => {
        const result = await this.callTool(mcpTool.name, params) as {
          content?: Array<{ type: string; text?: string }>;
          isError?: boolean;
        };

        // MCP returns content blocks — extract text
        const text = result.content
          ?.filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n') ?? JSON.stringify(result);

        return {
          content: text,
          isError: result.isError ?? false,
        };
      },
    };
  }

  private buildZodSchema(inputSchema: Record<string, unknown>): z.ZodType {
    if (!inputSchema || typeof inputSchema !== 'object') {
      return z.object({}).passthrough();
    }

    const properties = (inputSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
    const required = (inputSchema.required ?? []) as string[];
    const shape: Record<string, z.ZodType> = {};

    for (const [key, prop] of Object.entries(properties)) {
      let field: z.ZodType;
      switch (prop.type) {
        case 'string':
          field = z.string();
          break;
        case 'number':
        case 'integer':
          field = z.number();
          break;
        case 'boolean':
          field = z.boolean();
          break;
        case 'array':
          field = z.array(z.unknown());
          break;
        case 'object':
          field = z.object({}).passthrough();
          break;
        default:
          field = z.unknown();
      }

      if (prop.description) {
        field = field.describe(prop.description as string);
      }

      if (!required.includes(key)) {
        field = field.optional();
      }

      shape[key] = field;
    }

    return z.object(shape).passthrough();
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const message: McpMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pending.set(id, { resolve, reject });
      this.sendMessage(message);

      // Timeout per request
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request "${method}" timed out`));
        }
      }, 30_000);
    });
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    const message: McpMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.sendMessage(message);
  }

  private sendMessage(message: McpMessage): void {
    if (!this.process?.stdin) {
      throw new Error('MCP server process not available');
    }
    const data = JSON.stringify(message) + '\n';
    this.process.stdin.write(data);
  }

  private handleMessage(message: McpMessage): void {
    // Response to a request
    if (message.id !== undefined && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id)!;
      this.pending.delete(message.id);

      if (message.error) {
        reject(new Error(`MCP error ${message.error.code}: ${message.error.message}`));
      } else {
        resolve(message.result);
      }
    }
  }
}

/**
 * MCP Client Manager — manages multiple MCP server connections.
 */
export class McpManager {
  private clients = new Map<string, McpClient>();

  /**
   * Connect to an MCP server and register its tools.
   */
  async addServer(config: McpServerConfig): Promise<ToolDefinition[]> {
    const client = new McpClient(config);
    await client.connect();
    this.clients.set(config.name, client);
    return client.toToolDefinitions();
  }

  /**
   * Disconnect from an MCP server.
   */
  async removeServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.disconnect();
      this.clients.delete(name);
    }
  }

  /**
   * Get all connected clients.
   */
  getClients(): Map<string, McpClient> {
    return new Map(this.clients);
  }

  /**
   * Disconnect all servers.
   */
  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
  }
}
