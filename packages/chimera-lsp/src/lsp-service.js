"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChimeraLspService = void 0;
exports.formatLspOperationResult = formatLspOperationResult;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const vscode_languageserver_protocol_1 = require("vscode-languageserver-protocol");
const config_js_1 = require("./config.js");
const diagnostics_js_1 = require("./diagnostics.js");
const connection_js_1 = require("./connection.js");
const server_config_js_1 = require("./server-config.js");
const uri_js_1 = require("./uri.js");
class ChimeraLspService {
    workspaceRoot;
    configPath;
    connectionFactory;
    config;
    servers = new Map();
    diagnostics = new Map();
    documentVersions = new Map();
    documentTexts = new Map();
    constructor(workspaceRoot, options = {}) {
        this.workspaceRoot = path_1.default.resolve(workspaceRoot);
        this.configPath = options.configPath;
        this.connectionFactory = options.connectionFactory;
        this.config = options.config ?? config_js_1.DEFAULT_LSP_CONFIG;
        for (const [name, server] of Object.entries(this.config.servers)) {
            this.servers.set(name, { name, config: server, status: 'idle', openDocuments: new Set() });
        }
    }
    async start() {
        this.config = this.configPath
            ? (0, config_js_1.mergeLspConfig)(await (0, config_js_1.loadLspConfig)(this.workspaceRoot, this.configPath), this.config)
            : this.config;
        for (const name of Object.keys(this.config.servers)) {
            if (!this.servers.has(name)) {
                this.servers.set(name, {
                    name,
                    config: this.config.servers[name],
                    status: 'idle',
                    openDocuments: new Set(),
                });
            }
        }
        if (this.config.autoStart !== false && this.config.enabled !== false) {
            await Promise.all([...this.servers.keys()].map((name) => this.startServer(name).catch(() => undefined)));
        }
    }
    async dispose() {
        await Promise.all([...this.servers.values()].map((server) => this.stopServer(server)));
    }
    status() {
        return [...this.servers.values()].map((server) => ({
            name: server.name,
            status: server.status,
            error: server.error,
        }));
    }
    async getDiagnostics(filePath) {
        await this.ensureFile(filePath);
        const uri = (0, uri_js_1.pathToUri)(filePath, this.workspaceRoot);
        return this.diagnostics.get(uri) ?? [];
    }
    async goToDefinition(filePath, line, character) {
        const server = await this.ensureFile(filePath);
        if (!server?.connection)
            return [];
        const uri = (0, uri_js_1.pathToUri)(filePath, this.workspaceRoot);
        const result = await server.connection.sendRequest(vscode_languageserver_protocol_1.DefinitionRequest.method, { textDocument: { uri }, position: toPosition(line, character) });
        return normalizeLocations(result, this.workspaceRoot);
    }
    async findReferences(filePath, line, character, includeDeclaration = true) {
        const server = await this.ensureFile(filePath);
        if (!server?.connection)
            return [];
        const uri = (0, uri_js_1.pathToUri)(filePath, this.workspaceRoot);
        const result = await server.connection.sendRequest(vscode_languageserver_protocol_1.ReferencesRequest.method, { textDocument: { uri }, position: toPosition(line, character), context: { includeDeclaration } });
        return normalizeLocations(result ?? [], this.workspaceRoot);
    }
    async hover(filePath, line, character) {
        const server = await this.ensureFile(filePath);
        if (!server?.connection)
            return null;
        const uri = (0, uri_js_1.pathToUri)(filePath, this.workspaceRoot);
        const result = await server.connection.sendRequest(vscode_languageserver_protocol_1.HoverRequest.method, { textDocument: { uri }, position: toPosition(line, character) });
        if (!result?.contents)
            return null;
        return {
            contents: formatHoverContents(result.contents),
            range: result.range ? normalizeRange(result.range, uri, this.workspaceRoot) : undefined,
        };
    }
    async documentSymbols(filePath) {
        const server = await this.ensureFile(filePath);
        if (!server?.connection)
            return [];
        const uri = (0, uri_js_1.pathToUri)(filePath, this.workspaceRoot);
        const result = await server.connection.sendRequest(vscode_languageserver_protocol_1.DocumentSymbolRequest.method, { textDocument: { uri } });
        return normalizeDocumentSymbols(result ?? [], this.workspaceRoot);
    }
    async workspaceSymbols(query) {
        if (!this.config.enabled)
            return [];
        await this.start();
        const results = [];
        for (const server of this.servers.values()) {
            if (server.status !== 'ready' || !server.connection)
                continue;
            const result = await server.connection.sendRequest(vscode_languageserver_protocol_1.WorkspaceSymbolRequest.method, { query });
            results.push(...normalizeWorkspaceSymbols(result ?? [], this.workspaceRoot));
        }
        return results;
    }
    async updateDocument(filePath) {
        const server = await this.ensureFile(filePath);
        if (!server?.connection)
            return;
        const uri = (0, uri_js_1.pathToUri)(filePath, this.workspaceRoot);
        if (!server.openDocuments.has(uri)) {
            await this.openDocument(server, filePath);
            return;
        }
        const text = await fs_1.promises.readFile((0, uri_js_1.toAbsolutePath)(filePath, this.workspaceRoot), 'utf-8');
        const version = (this.documentVersions.get(uri) ?? 0) + 1;
        this.documentTexts.set(uri, text);
        this.documentVersions.set(uri, version);
        server.connection.sendNotification(vscode_languageserver_protocol_1.DidChangeTextDocumentNotification.method, {
            textDocument: { uri, version },
            contentChanges: [{ text }],
        });
    }
    async ensureFile(filePath) {
        if (!this.config.enabled)
            return undefined;
        const name = this.findServerName(filePath);
        if (!name)
            return undefined;
        const server = this.servers.get(name);
        if (!server)
            return undefined;
        await this.startServer(name);
        if (server.status === 'ready') {
            await this.openDocument(server, filePath);
        }
        return server;
    }
    findServerName(filePath) {
        for (const [name, server] of this.servers) {
            if ((0, server_config_js_1.serverMatchesFile)(server.config, filePath, this.workspaceRoot))
                return name;
        }
        return undefined;
    }
    async startServer(name) {
        const server = this.servers.get(name);
        if (!server || server.status === 'ready' || server.status === 'starting')
            return;
        if (server.config.enabled === false || this.config.enabled === false)
            return;
        server.status = 'starting';
        server.error = undefined;
        try {
            const { child, connection } = await (0, connection_js_1.startLspConnection)({
                workspaceRoot: this.workspaceRoot,
                config: server.config,
                connectionFactory: this.connectionFactory,
            });
            server.child = child;
            server.connection = connection;
            connection.onNotification(vscode_languageserver_protocol_1.PublishDiagnosticsNotification.method, (params) => {
                this.handleDiagnostics(params);
            });
            await connection.sendRequest(vscode_languageserver_protocol_1.InitializeRequest.method, this.initializeParams());
            connection.sendNotification(vscode_languageserver_protocol_1.InitializedNotification.method, {});
            server.status = 'ready';
        }
        catch (err) {
            server.status = 'error';
            server.error = err instanceof Error ? err.message : String(err);
            await this.stopServer(server);
        }
    }
    initializeParams() {
        return {
            processId: process.pid,
            rootUri: (0, uri_js_1.pathToUri)(this.workspaceRoot, this.workspaceRoot),
            capabilities: {
                textDocument: {
                    synchronization: {
                        dynamicRegistration: false,
                        didSave: false,
                    },
                    definition: { linkSupport: true },
                    references: {},
                    hover: { contentFormat: ['markdown', 'plaintext'] },
                    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
                },
                workspace: {
                    symbol: {},
                },
            },
        };
    }
    async openDocument(server, filePath) {
        if (!server.connection)
            return;
        const absolute = (0, uri_js_1.toAbsolutePath)(filePath, this.workspaceRoot);
        const uri = (0, uri_js_1.pathToUri)(absolute, this.workspaceRoot);
        if (server.openDocuments.has(uri))
            return;
        const text = await fs_1.promises.readFile(absolute, 'utf-8');
        const version = (this.documentVersions.get(uri) ?? 0) + 1;
        this.documentTexts.set(uri, text);
        this.documentVersions.set(uri, version);
        server.openDocuments.add(uri);
        server.connection.sendNotification(vscode_languageserver_protocol_1.DidOpenTextDocumentNotification.method, {
            textDocument: {
                uri,
                languageId: languageId(filePath),
                version,
                text,
            },
        });
    }
    handleDiagnostics(params) {
        const diagnostics = (0, diagnostics_js_1.normalizeDiagnostics)(params.diagnostics, params.uri, this.workspaceRoot, this.config.diagnosticsLimit);
        this.diagnostics.set(params.uri, diagnostics);
    }
    async stopServer(server) {
        server.status = 'stopped';
        try {
            if (server.connection) {
                try {
                    await server.connection.sendRequest(vscode_languageserver_protocol_1.ShutdownRequest.method);
                }
                catch {
                    // Ignore shutdown failures during cleanup.
                }
                server.connection.sendNotification(vscode_languageserver_protocol_1.ExitNotification.method);
                server.connection.dispose();
            }
        }
        finally {
            if (server.child && !server.child.killed) {
                server.child.kill();
            }
            server.child = undefined;
            server.connection = undefined;
            server.openDocuments.clear();
        }
    }
}
exports.ChimeraLspService = ChimeraLspService;
function toPosition(line, character) {
    return { line: line - 1, character: character - 1 };
}
function normalizeLocations(result, workspaceRoot) {
    const items = Array.isArray(result) ? result : (result ? [result] : []);
    return items.flatMap((item) => {
        if ('targetUri' in item) {
            return [{
                    uri: item.targetUri,
                    filePath: (0, uri_js_1.uriToPath)(item.targetUri),
                    range: item.targetRange,
                }];
        }
        return [{
                uri: item.uri,
                filePath: (0, uri_js_1.uriToPath)(item.uri),
                range: item.range,
            }];
    }).map((location) => ({
        ...location,
        filePath: (0, uri_js_1.relativePath)(location.filePath, workspaceRoot),
    }));
}
function normalizeRange(range, uri, workspaceRoot) {
    return {
        uri,
        filePath: (0, uri_js_1.relativePath)((0, uri_js_1.uriToPath)(uri), workspaceRoot),
        range,
    };
}
function normalizeDocumentSymbols(symbols, workspaceRoot) {
    return symbols.map((symbol) => {
        if ('location' in symbol) {
            return {
                name: symbol.name,
                kind: String(symbol.kind),
                range: normalizeRange(symbol.location.range, symbol.location.uri, workspaceRoot),
            };
        }
        return {
            name: symbol.name,
            kind: String(symbol.kind),
            range: normalizeRange(symbol.range, 'file://unused', workspaceRoot),
            children: symbol.children ? normalizeDocumentSymbols(symbol.children, workspaceRoot) : undefined,
        };
    });
}
function normalizeWorkspaceSymbols(symbols, workspaceRoot) {
    return symbols.map((symbol) => {
        const loc = 'location' in symbol ? symbol.location : undefined;
        const uri = loc && 'uri' in loc ? loc.uri : '';
        const range = loc && 'range' in loc
            ? loc.range
            : { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
        return {
            name: symbol.name,
            kind: String(symbol.kind),
            location: normalizeRange(range, uri, workspaceRoot),
            containerName: 'containerName' in symbol ? symbol.containerName : undefined,
        };
    });
}
function formatHoverContents(contents) {
    if (typeof contents === 'string')
        return contents;
    if ('value' in contents)
        return contents.value;
    if (Array.isArray(contents))
        return contents.map(formatMarkedString).join('\n\n');
    return formatMarkedString(contents);
}
function formatMarkedString(value) {
    if (typeof value === 'string')
        return value;
    return value.value;
}
function languageId(filePath) {
    switch (path_1.default.extname(filePath).toLowerCase()) {
        case '.ts': return 'typescript';
        case '.tsx': return 'typescriptreact';
        case '.js': return 'javascript';
        case '.jsx': return 'javascriptreact';
        case '.py': return 'python';
        case '.go': return 'go';
        case '.rs': return 'rust';
        case '.java': return 'java';
        case '.cs': return 'csharp';
        case '.css': return 'css';
        case '.scss': return 'scss';
        case '.json': return 'json';
        case '.md': return 'markdown';
        default: return 'plaintext';
    }
}
function formatLspOperationResult(data, formatted, fallback) {
    return { data, formatted, fallback };
}
//# sourceMappingURL=lsp-service.js.map