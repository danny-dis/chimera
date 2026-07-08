"use strict";
/**
 * MCP (Model Context Protocol) Client — connects to MCP servers
 * and exposes their tools as Chimera tools.
 *
 * Supports stdio and Streamable HTTP transports, config file loading,
 * health monitoring, auto-reconnect, and tool filtering.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpManager = exports.McpClient = void 0;
const child_process_1 = require("child_process");
const zod_1 = require("zod");
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 30_000;
const DEFAULT_RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 5_000;
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
    status = 'disconnected';
    statusListeners = new Set();
    constructor(server) {
        this.server = server;
    }
    onStatusChange(listener) {
        this.statusListeners.add(listener);
        return () => { this.statusListeners.delete(listener); };
    }
    getStatus() {
        return this.status;
    }
    setStatus(status) {
        this.status = status;
        for (const listener of this.statusListeners) {
            try {
                listener(status);
            }
            catch { /* ignore */ }
        }
    }
    /**
     * Connect to the MCP server and discover available tools.
     */
    async connect() {
        this.setStatus('connecting');
        if (this.server.transport === 'http' && this.server.url) {
            await this.connectHttp();
        }
        else if (this.server.transport === 'stdio') {
            await this.connectStdio();
        }
        else {
            this.setStatus('failed');
            throw new Error(`Transport "${this.server.transport}" not supported. Use "stdio" or "http".`);
        }
    }
    async connectStdio() {
        if (!this.server.command) {
            this.setStatus('failed');
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
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            this.handleMessage(JSON.parse(line));
                        }
                        catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            console.error(`[mcp:${this.server.name}] parse error: ${msg}`);
                        }
                    }
                }
            });
            this.process.stderr?.on('data', (data) => {
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
                const toolsResult = await this.sendRequest('tools/list', {});
                this.tools = toolsResult.tools ?? [];
                try {
                    const resResult = await this.sendRequest('resources/list', {});
                    this.resources = resResult.resources ?? [];
                }
                catch { /* optional */ }
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
    async connectHttp() {
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
            const toolsData = await toolsRes.json();
            this.tools = toolsData.result?.tools ?? [];
            try {
                const resRes = await fetch(this.server.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'resources/list', params: {} }),
                });
                const resData = await resRes.json();
                this.resources = resData.result?.resources ?? [];
            }
            catch { /* optional */ }
            this.connected = true;
            this.setStatus('connected');
        }
        catch (err) {
            this.setStatus('failed');
            throw err;
        }
    }
    getTools() {
        return [...this.tools];
    }
    getResources() {
        return [...this.resources];
    }
    async readResource(uri) {
        if (!this.connected)
            throw new Error(`Not connected to "${this.server.name}"`);
        if (this.server.transport === 'http' && this.server.url) {
            const res = await fetch(this.server.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: ++this.messageId, method: 'resources/read', params: { uri } }),
            });
            const data = await res.json();
            return data.result;
        }
        return this.sendRequest('resources/read', { uri });
    }
    async callTool(name, args) {
        if (!this.connected)
            throw new Error(`Not connected to "${this.server.name}"`);
        if (this.server.transport === 'http' && this.server.url) {
            const res = await fetch(this.server.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: ++this.messageId, method: 'tools/call', params: { name, arguments: args } }),
            });
            const data = await res.json();
            if (data.error)
                throw new Error(`MCP error ${data.error.code}: ${data.error.message}`);
            return data.result;
        }
        return this.sendRequest('tools/call', { name, arguments: args });
    }
    async disconnect() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
        this.connected = false;
        this.setStatus('disconnected');
    }
    isConnected() {
        return this.connected;
    }
    /**
     * Convert MCP tools into Chimera ToolDefinitions, filtered by include/exclude lists.
     */
    toToolDefinitions() {
        return this.tools
            .filter((t) => this.isToolAllowed(t.name))
            .map((mcpTool) => this.adaptTool(mcpTool));
    }
    isToolAllowed(toolName) {
        if (this.server.includeTools && this.server.includeTools.length > 0) {
            return this.server.includeTools.includes(toolName);
        }
        if (this.server.excludeTools && this.server.excludeTools.length > 0) {
            return !this.server.excludeTools.includes(toolName);
        }
        return true;
    }
    adaptTool(mcpTool) {
        const schema = this.buildZodSchema(mcpTool.inputSchema);
        return {
            name: `mcp__${this.server.name}__${mcpTool.name}`,
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
                default: field = zod_1.z.unknown();
            }
            if (prop.description)
                field = field.describe(prop.description);
            if (!required.includes(key))
                field = field.optional();
            shape[key] = field;
        }
        return zod_1.z.object(shape).passthrough();
    }
    sendRequest(method, params) {
        return new Promise((resolve, reject) => {
            const id = ++this.messageId;
            const message = { jsonrpc: '2.0', id, method, params };
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
    sendNotification(method, params) {
        this.sendMessage({ jsonrpc: '2.0', method, params });
    }
    sendMessage(message) {
        if (!this.process?.stdin)
            throw new Error('MCP server process not available');
        this.process.stdin.write(JSON.stringify(message) + '\n');
    }
    handleMessage(message) {
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
 * MCP Client Manager — manages multiple MCP server connections
 * with health monitoring and auto-reconnect.
 */
class McpManager {
    clients = new Map();
    configs = new Map();
    healthTimers = new Map();
    reconnectAttempts = new Map();
    async addServer(config, options) {
        if (options?.skipDisabled && config.enabled === false)
            return [];
        if (this.clients.has(config.name))
            return this.clients.get(config.name).toToolDefinitions();
        const client = new McpClient(config);
        this.clients.set(config.name, client);
        this.configs.set(config.name, config);
        client.onStatusChange((status) => {
            if (status === 'failed' || status === 'disconnected') {
                this.scheduleReconnect(config.name);
            }
            else if (status === 'connected') {
                this.reconnectAttempts.delete(config.name);
            }
        });
        await client.connect();
        this.startHealthCheck(config.name);
        return client.toToolDefinitions();
    }
    async removeServer(name) {
        this.stopHealthCheck(name);
        this.reconnectAttempts.delete(name);
        const client = this.clients.get(name);
        if (client) {
            await client.disconnect();
            this.clients.delete(name);
            this.configs.delete(name);
        }
    }
    getClients() {
        return new Map(this.clients);
    }
    getAllTools() {
        const tools = [];
        for (const client of this.clients.values()) {
            tools.push(...client.toToolDefinitions());
        }
        return tools;
    }
    async disconnectAll() {
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
    startHealthCheck(name) {
        this.stopHealthCheck(name);
        const timer = setInterval(async () => {
            const client = this.clients.get(name);
            if (client && !client.isConnected()) {
                const config = this.configs.get(name);
                if (config)
                    this.scheduleReconnect(name);
            }
        }, DEFAULT_HEALTH_CHECK_INTERVAL_MS);
        this.healthTimers.set(name, timer);
    }
    stopHealthCheck(name) {
        const timer = this.healthTimers.get(name);
        if (timer) {
            clearInterval(timer);
            this.healthTimers.delete(name);
        }
    }
    scheduleReconnect(name) {
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
            if (!config || !client)
                return;
            try {
                client.setStatus('reconnecting');
                await client.connect();
                this.startHealthCheck(name);
            }
            catch (err) {
                console.error(`[mcp:${name}] reconnect failed: ${err instanceof Error ? err.message : String(err)}`);
                this.scheduleReconnect(name);
            }
        }, delay);
    }
    /**
     * Load MCP config from a .mcp.json file.
     */
    static loadConfigFile(config) {
        return Object.entries(config.mcpServers).map(([name, server]) => ({
            name,
            ...server,
            enabled: server.enabled ?? true,
        }));
    }
}
exports.McpManager = McpManager;
//# sourceMappingURL=mcp-client.js.map