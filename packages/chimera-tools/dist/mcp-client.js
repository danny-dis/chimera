"use strict";
/**
 * MCP (Model Context Protocol) Client — connects to MCP servers
 * and exposes their tools as Chimera tools.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpManager = exports.McpClient = void 0;
const child_process_1 = require("child_process");
const zod_1 = require("zod");
/**
 * MCP Client — manages connection to an MCP server and adapts its tools.
 */
class McpClient {
    server;
    process = null;
    messageId = 0;
    pending = new Map();
    tools = [];
    resources = [];
    connected = false;
    constructor(server) {
        this.server = server;
    }
    /**
     * Connect to the MCP server and discover available tools.
     */
    async connect() {
        if (this.server.transport !== 'stdio') {
            throw new Error(`Transport "${this.server.transport}" not yet supported. Use "stdio".`);
        }
        if (!this.server.command) {
            throw new Error('stdio transport requires a "command" field');
        }
        return new Promise((resolve, reject) => {
            this.process = (0, child_process_1.spawn)(this.server.command, this.server.args ?? [], {
                env: { ...process.env, ...this.server.env },
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            let buffer = '';
            this.process.stdout?.on('data', (data) => {
                buffer += data.toString();
                // MCP uses newline-delimited JSON
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            this.handleMessage(JSON.parse(line));
                        }
                        catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            console.error(`[mcp:${this.server.name}] Failed to parse message: ${msg}\nLine: ${line.substring(0, 200)}`);
                        }
                    }
                }
            });
            this.process.stderr?.on('data', (data) => {
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
                const toolsResult = await this.sendRequest('tools/list', {});
                this.tools = toolsResult.tools ?? [];
                // List resources (if server supports it)
                try {
                    const resResult = await this.sendRequest('resources/list', {});
                    this.resources = resResult.resources ?? [];
                }
                catch {
                    // Server may not support resources — not an error
                }
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
    getTools() {
        return [...this.tools];
    }
    getResources() {
        return [...this.resources];
    }
    async readResource(uri) {
        if (!this.connected) {
            throw new Error(`Not connected to MCP server "${this.server.name}"`);
        }
        return this.sendRequest('resources/read', { uri });
    }
    /**
     * Call a tool on the MCP server.
     */
    async callTool(name, args) {
        if (!this.connected) {
            throw new Error(`Not connected to MCP server "${this.server.name}"`);
        }
        return this.sendRequest('tools/call', { name, arguments: args });
    }
    /**
     * Disconnect from the MCP server.
     */
    async disconnect() {
        if (this.process) {
            this.process.kill();
            this.process = null;
            this.connected = false;
        }
    }
    isConnected() {
        return this.connected;
    }
    /**
     * Convert MCP tools into Chimera ToolDefinitions.
     */
    toToolDefinitions() {
        return this.tools.map((mcpTool) => this.adaptTool(mcpTool));
    }
    adaptTool(mcpTool) {
        // Build a Zod schema from the MCP input schema
        const schema = this.buildZodSchema(mcpTool.inputSchema);
        return {
            name: `mcp_${this.server.name}_${mcpTool.name}`,
            description: `[MCP:${this.server.name}] ${mcpTool.description}`,
            parameters: schema,
            returns: zod_1.z.object({
                content: zod_1.z.unknown(),
                isError: zod_1.z.boolean().optional(),
            }),
            category: 'mcp',
            permissionLevel: 'execute',
            execute: async (params, _context) => {
                const result = await this.callTool(mcpTool.name, params);
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
    buildZodSchema(inputSchema) {
        if (!inputSchema || typeof inputSchema !== 'object') {
            return zod_1.z.object({}).passthrough();
        }
        const properties = (inputSchema.properties ?? {});
        const required = (inputSchema.required ?? []);
        const shape = {};
        for (const [key, prop] of Object.entries(properties)) {
            let field;
            switch (prop.type) {
                case 'string':
                    field = zod_1.z.string();
                    break;
                case 'number':
                case 'integer':
                    field = zod_1.z.number();
                    break;
                case 'boolean':
                    field = zod_1.z.boolean();
                    break;
                case 'array':
                    field = zod_1.z.array(zod_1.z.unknown());
                    break;
                case 'object':
                    field = zod_1.z.object({}).passthrough();
                    break;
                default:
                    field = zod_1.z.unknown();
            }
            if (prop.description) {
                field = field.describe(prop.description);
            }
            if (!required.includes(key)) {
                field = field.optional();
            }
            shape[key] = field;
        }
        return zod_1.z.object(shape).passthrough();
    }
    sendRequest(method, params) {
        return new Promise((resolve, reject) => {
            const id = ++this.messageId;
            const message = {
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
    sendNotification(method, params) {
        const message = {
            jsonrpc: '2.0',
            method,
            params,
        };
        this.sendMessage(message);
    }
    sendMessage(message) {
        if (!this.process?.stdin) {
            throw new Error('MCP server process not available');
        }
        const data = JSON.stringify(message) + '\n';
        this.process.stdin.write(data);
    }
    handleMessage(message) {
        // Response to a request
        if (message.id !== undefined && this.pending.has(message.id)) {
            const { resolve, reject } = this.pending.get(message.id);
            this.pending.delete(message.id);
            if (message.error) {
                reject(new Error(`MCP error ${message.error.code}: ${message.error.message}`));
            }
            else {
                resolve(message.result);
            }
        }
    }
}
exports.McpClient = McpClient;
/**
 * MCP Client Manager — manages multiple MCP server connections.
 */
class McpManager {
    clients = new Map();
    /**
     * Connect to an MCP server and register its tools.
     */
    async addServer(config) {
        const client = new McpClient(config);
        await client.connect();
        this.clients.set(config.name, client);
        return client.toToolDefinitions();
    }
    /**
     * Disconnect from an MCP server.
     */
    async removeServer(name) {
        const client = this.clients.get(name);
        if (client) {
            await client.disconnect();
            this.clients.delete(name);
        }
    }
    /**
     * Get all connected clients.
     */
    getClients() {
        return new Map(this.clients);
    }
    /**
     * Disconnect all servers.
     */
    async disconnectAll() {
        for (const client of this.clients.values()) {
            await client.disconnect();
        }
        this.clients.clear();
    }
}
exports.McpManager = McpManager;
//# sourceMappingURL=mcp-client.js.map