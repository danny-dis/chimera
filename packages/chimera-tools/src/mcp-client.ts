/**
 * MCP (Model Context Protocol) Client — connects to MCP servers
 * and exposes their tools as Chimera tools.
 *
 * Supports stdio and Streamable HTTP transports, config file loading,
 * health monitoring, auto-reconnect, and tool filtering.
 */

import { spawn, type ChildProcess } from 'child_process';
import { z } from 'zod';
import type { ToolDefinition, ToolContext } from './tool-schema.js';

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

interface McpMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 30_000;
const DEFAULT_RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 5_000;

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
  private resources: McpResource[] = [];
  private connected = false;
  private status: McpConnectionStatus = 'disconnected';
  private statusListeners: Set<(status: McpConnectionStatus) => void> = new Set();

  constructor(server: McpServerConfig) {
    this.server = server;
  }

  onStatusChange(listener: (status: McpConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => { this.statusListeners.delete(listener); };
  }

  getStatus(): McpConnectionStatus {
    return this.status;
  }

  setStatus(status: McpConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      try { listener(status); } catch { /* ignore */ }
    }
  }

  /**
   * Connect to the MCP server and discover available tools.
   */
  async connect(): Promise<void> {
    this.setStatus('connecting');

    if (this.server.transport === 'http' && this.server.url) {
      await this.connectHttp();
    } else if (this.server.transport === 'stdio') {
      await this.connectStdio();
    } else {
      this.setStatus('failed');
      throw new Error(`Transport "${this.server.transport}" not supported. Use "stdio" or "http".`);
    }
  }

  private async connectStdio(): Promise<void> {
    if (!this.server.command) {
      this.setStatus('failed');
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
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) {
            try {
              this.handleMessage(JSON.parse(line));
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`[mcp:${this.server.name}] parse error: ${msg}`);
            }
          }
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error(`[mcp:${this.server.name}] ${data.toString().trim()}`);
      });

      this.process.on('error', (err) => {
        this.connected = false;
        this.setStatus('failed');
        reject(new Error(`MCP server "${this.server.name}" failed to start: ${err.message}`));
      });

      this.process.on('exit', (code) => {
        this.connected = false;
        if (code !== 0 && code !== null) {
          console.error(`[mcp:${this.server.name}] exited with code ${code}`);
        }
      });

      this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'chimera', version: '1.0.0' },
      }).then(async () => {
        this.sendNotification('notifications/initialized', {});
        const toolsResult = await this.sendRequest('tools/list', {}) as { tools?: McpTool[] };
        this.tools = toolsResult.tools ?? [];
        try {
          const resResult = await this.sendRequest('resources/list', {}) as { resources?: McpResource[] };
          this.resources = resResult.resources ?? [];
        } catch { /* optional */ }
        this.connected = true;
        this.setStatus('connected');
        resolve();
      }).catch((err) => {
        this.setStatus('failed');
        reject(err);
      });

      setTimeout(() => {
        if (!this.connected) {
          this.setStatus('failed');
          reject(new Error(`MCP server "${this.server.name}" connection timed out`));
        }
      }, DEFAULT_DISCOVERY_TIMEOUT_MS);
    });
  }

  private async connectHttp(): Promise<void> {
    if (!this.server.url) {
      this.setStatus('failed');
      throw new Error('http transport requires a "url" field');
    }

    try {
      const initRes = await fetch(this.server.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'chimera', version: '1.0.0' },
          },
        }),
        signal: AbortSignal.timeout(DEFAULT_DISCOVERY_TIMEOUT_MS),
      });

      if (!initRes.ok) {
        throw new Error(`HTTP ${initRes.status}: ${initRes.statusText}`);
      }

      await fetch(this.server.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
      });

      const toolsRes = await fetch(this.server.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      });
      const toolsData = await toolsRes.json() as { result?: { tools?: McpTool[] } };
      this.tools = toolsData.result?.tools ?? [];

      try {
        const resRes = await fetch(this.server.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'resources/list', params: {} }),
        });
        const resData = await resRes.json() as { result?: { resources?: McpResource[] } };
        this.resources = resData.result?.resources ?? [];
      } catch { /* optional */ }

      this.connected = true;
      this.setStatus('connected');
    } catch (err) {
      this.setStatus('failed');
      throw err;
    }
  }

  getTools(): McpTool[] {
    return [...this.tools];
  }

  getResources(): McpResource[] {
    return [...this.resources];
  }

  async readResource(uri: string): Promise<unknown> {
    if (!this.connected) throw new Error(`Not connected to "${this.server.name}"`);
    if (this.server.transport === 'http' && this.server.url) {
      const res = await fetch(this.server.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++this.messageId, method: 'resources/read', params: { uri } }),
      });
      const data = await res.json() as { result?: unknown };
      return data.result;
    }
    return this.sendRequest('resources/read', { uri });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) throw new Error(`Not connected to "${this.server.name}"`);
    if (this.server.transport === 'http' && this.server.url) {
      const res = await fetch(this.server.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++this.messageId, method: 'tools/call', params: { name, arguments: args } }),
      });
      const data = await res.json() as { result?: unknown; error?: { code: number; message: string } };
      if (data.error) throw new Error(`MCP error ${data.error.code}: ${data.error.message}`);
      return data.result;
    }
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
    this.setStatus('disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Convert MCP tools into Chimera ToolDefinitions, filtered by include/exclude lists.
   */
  toToolDefinitions(): ToolDefinition[] {
    return this.tools
      .filter((t) => this.isToolAllowed(t.name))
      .map((mcpTool) => this.adaptTool(mcpTool));
  }

  private isToolAllowed(toolName: string): boolean {
    if (this.server.includeTools && this.server.includeTools.length > 0) {
      return this.server.includeTools.includes(toolName);
    }
    if (this.server.excludeTools && this.server.excludeTools.length > 0) {
      return !this.server.excludeTools.includes(toolName);
    }
    return true;
  }

  private adaptTool(mcpTool: McpTool): ToolDefinition {
    const schema = this.buildZodSchema(mcpTool.inputSchema);

    return {
      name: `mcp__${this.server.name}__${mcpTool.name}`,
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
        case 'string': field = z.string(); break;
        case 'number':
        case 'integer': field = z.number(); break;
        case 'boolean': field = z.boolean(); break;
        case 'array': field = z.array(z.unknown()); break;
        case 'object': field = z.object({}).passthrough(); break;
        default: field = z.unknown();
      }
      if (prop.description) field = field.describe(prop.description as string);
      if (!required.includes(key)) field = field.optional();
      shape[key] = field;
    }

    return z.object(shape).passthrough();
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const message: McpMessage = { jsonrpc: '2.0', id, method, params };
      this.pending.set(id, { resolve, reject });
      this.sendMessage(message);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request "${method}" timed out`));
        }
      }, 30_000);
    });
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    this.sendMessage({ jsonrpc: '2.0', method, params });
  }

  private sendMessage(message: McpMessage): void {
    if (!this.process?.stdin) throw new Error('MCP server process not available');
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  private handleMessage(message: McpMessage): void {
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
 * MCP Client Manager — manages multiple MCP server connections
 * with health monitoring and auto-reconnect.
 */
export class McpManager {
  private clients = new Map<string, McpClient>();
  private configs = new Map<string, McpServerConfig>();
  private healthTimers = new Map<string, ReturnType<typeof setInterval>>();
  private reconnectAttempts = new Map<string, number>();

  async addServer(config: McpServerConfig, options?: { skipDisabled?: boolean }): Promise<ToolDefinition[]> {
    if (options?.skipDisabled && config.enabled === false) return [];
    if (this.clients.has(config.name)) return this.clients.get(config.name)!.toToolDefinitions();

    const client = new McpClient(config);
    this.clients.set(config.name, client);
    this.configs.set(config.name, config);

    client.onStatusChange((status) => {
      if (status === 'failed' || status === 'disconnected') {
        this.scheduleReconnect(config.name);
      } else if (status === 'connected') {
        this.reconnectAttempts.delete(config.name);
      }
    });

    await client.connect();
    this.startHealthCheck(config.name);
    return client.toToolDefinitions();
  }

  async removeServer(name: string): Promise<void> {
    this.stopHealthCheck(name);
    this.reconnectAttempts.delete(name);
    const client = this.clients.get(name);
    if (client) {
      await client.disconnect();
      this.clients.delete(name);
      this.configs.delete(name);
    }
  }

  getClients(): Map<string, McpClient> {
    return new Map(this.clients);
  }

  getAllTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const client of this.clients.values()) {
      tools.push(...client.toToolDefinitions());
    }
    return tools;
  }

  async disconnectAll(): Promise<void> {
    for (const name of this.clients.keys()) {
      this.stopHealthCheck(name);
    }
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
    this.configs.clear();
    this.reconnectAttempts.clear();
  }

  private startHealthCheck(name: string): void {
    this.stopHealthCheck(name);
    const timer = setInterval(async () => {
      const client = this.clients.get(name);
      if (client && !client.isConnected()) {
        const config = this.configs.get(name);
        if (config) this.scheduleReconnect(name);
      }
    }, DEFAULT_HEALTH_CHECK_INTERVAL_MS);
    this.healthTimers.set(name, timer);
  }

  private stopHealthCheck(name: string): void {
    const timer = this.healthTimers.get(name);
    if (timer) {
      clearInterval(timer);
      this.healthTimers.delete(name);
    }
  }

  private scheduleReconnect(name: string): void {
    const attempts = this.reconnectAttempts.get(name) ?? 0;
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[mcp:${name}] max reconnect attempts reached, giving up`);
      this.reconnectAttempts.set(name, 0);
      return;
    }

    this.reconnectAttempts.set(name, attempts + 1);
    const delay = DEFAULT_RECONNECT_DELAY_MS * Math.pow(2, attempts);
    console.log(`[mcp:${name}] reconnecting in ${delay}ms (attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

    setTimeout(async () => {
      const config = this.configs.get(name);
      const client = this.clients.get(name);
      if (!config || !client) return;

      try {
        client.setStatus('reconnecting');
        await client.connect();
        this.startHealthCheck(name);
      } catch (err) {
        console.error(`[mcp:${name}] reconnect failed: ${err instanceof Error ? err.message : String(err)}`);
        this.scheduleReconnect(name);
      }
    }, delay);
  }

  /**
   * Load MCP config from a .mcp.json file.
   */
  static loadConfigFile(config: McpConfigFile): McpServerConfig[] {
    return Object.entries(config.mcpServers).map(([name, server]) => ({
      name,
      ...server,
      enabled: server.enabled ?? true,
    }));
  }
}
