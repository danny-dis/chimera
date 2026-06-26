import { promises as fs } from 'fs';
import path from 'path';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import {
  DefinitionRequest,
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DocumentSymbolRequest,
  ExitNotification,
  HoverRequest,
  InitializedNotification,
  InitializeRequest,
  PublishDiagnosticsNotification,
  ReferencesRequest,
  ShutdownRequest,
  WorkspaceSymbolRequest,
  type DocumentSymbol,
  type Hover,
  type InitializeParams,
  type InitializeResult,
  type Location,
  type LocationLink,
  type MarkedString,
  type Position,
  type PublishDiagnosticsParams,
  type Range,
  type SymbolInformation,
  type WorkspaceSymbol,
} from 'vscode-languageserver-protocol';
import { DEFAULT_LSP_CONFIG, loadLspConfig, mergeLspConfig } from './config.js';
import { normalizeDiagnostics } from './diagnostics.js';
import type { LspConnection } from './connection.js';
import { startLspConnection } from './connection.js';
import { serverMatchesFile } from './server-config.js';
import type { LspDiagnostic, LspDocumentSymbol, LspHover, LspLocation, LspOperationResult, LspServerConfig, LspServerStatus, LspService, LspWorkspaceConfig, LspWorkspaceSymbol } from './types.js';
import { pathToUri, relativePath, toAbsolutePath, uriToPath } from './uri.js';

interface ManagedServer {
  name: string;
  config: LspServerConfig;
  status: LspServerStatus;
  error?: string;
  child?: ChildProcessWithoutNullStreams;
  connection?: LspConnection;
  openDocuments: Set<string>;
}

export interface LspServiceOptions {
  config?: LspWorkspaceConfig;
  configPath?: string;
  connectionFactory?: (child: ChildProcessWithoutNullStreams, config: LspServerConfig) => Promise<LspConnection>;
}

export class ChimeraLspService implements LspService {
  private readonly workspaceRoot: string;
  private readonly configPath?: string;
  private readonly connectionFactory?: (child: ChildProcessWithoutNullStreams, config: LspServerConfig) => Promise<LspConnection>;
  private config: LspWorkspaceConfig;
  private readonly servers = new Map<string, ManagedServer>();
  private readonly diagnostics = new Map<string, LspDiagnostic[]>();
  private readonly documentVersions = new Map<string, number>();
  private readonly documentTexts = new Map<string, string>();

  constructor(workspaceRoot: string, options: LspServiceOptions = {}) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.configPath = options.configPath;
    this.connectionFactory = options.connectionFactory;
    this.config = options.config ?? DEFAULT_LSP_CONFIG;
    for (const [name, server] of Object.entries(this.config.servers)) {
      this.servers.set(name, { name, config: server, status: 'idle', openDocuments: new Set() });
    }
  }

  async start(): Promise<void> {
    this.config = this.configPath
      ? mergeLspConfig(await loadLspConfig(this.workspaceRoot, this.configPath), this.config)
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

  async dispose(): Promise<void> {
    await Promise.all([...this.servers.values()].map((server) => this.stopServer(server)));
  }

  status(): Array<{ name: string; status: LspServerStatus; error?: string }> {
    return [...this.servers.values()].map((server) => ({
      name: server.name,
      status: server.status,
      error: server.error,
    }));
  }

  async getDiagnostics(filePath: string): Promise<LspDiagnostic[]> {
    await this.ensureFile(filePath);
    const uri = pathToUri(filePath, this.workspaceRoot);
    return this.diagnostics.get(uri) ?? [];
  }

  async goToDefinition(filePath: string, line: number, character: number): Promise<LspLocation[]> {
    const server = await this.ensureFile(filePath);
    if (!server?.connection) return [];
    const uri = pathToUri(filePath, this.workspaceRoot);
    const result = await server.connection.sendRequest<Location[] | Location | LocationLink[] | null>(
      DefinitionRequest.method,
      { textDocument: { uri }, position: toPosition(line, character) },
    );
    return normalizeLocations(result, this.workspaceRoot);
  }

  async findReferences(
    filePath: string,
    line: number,
    character: number,
    includeDeclaration = true,
  ): Promise<LspLocation[]> {
    const server = await this.ensureFile(filePath);
    if (!server?.connection) return [];
    const uri = pathToUri(filePath, this.workspaceRoot);
    const result = await server.connection.sendRequest<Location[] | null>(
      ReferencesRequest.method,
      { textDocument: { uri }, position: toPosition(line, character), context: { includeDeclaration } },
    );
    return normalizeLocations(result ?? [], this.workspaceRoot);
  }

  async hover(filePath: string, line: number, character: number): Promise<LspHover | null> {
    const server = await this.ensureFile(filePath);
    if (!server?.connection) return null;
    const uri = pathToUri(filePath, this.workspaceRoot);
    const result = await server.connection.sendRequest<Hover | null>(
      HoverRequest.method,
      { textDocument: { uri }, position: toPosition(line, character) },
    );
    if (!result?.contents) return null;
    return {
      contents: formatHoverContents(result.contents),
      range: result.range ? normalizeRange(result.range, uri, this.workspaceRoot) : undefined,
    };
  }

  async documentSymbols(filePath: string): Promise<LspDocumentSymbol[]> {
    const server = await this.ensureFile(filePath);
    if (!server?.connection) return [];
    const uri = pathToUri(filePath, this.workspaceRoot);
    const result = await server.connection.sendRequest<DocumentSymbol[] | SymbolInformation[] | null>(
      DocumentSymbolRequest.method,
      { textDocument: { uri } },
    );
    return normalizeDocumentSymbols(result ?? [], this.workspaceRoot);
  }

  async workspaceSymbols(query: string): Promise<LspWorkspaceSymbol[]> {
    if (!this.config.enabled) return [];
    await this.start();
    const results: LspWorkspaceSymbol[] = [];
    for (const server of this.servers.values()) {
      if (server.status !== 'ready' || !server.connection) continue;
      const result = await server.connection.sendRequest<WorkspaceSymbol[] | null>(
        WorkspaceSymbolRequest.method,
        { query },
      );
      results.push(...normalizeWorkspaceSymbols(result ?? [], this.workspaceRoot));
    }
    return results;
  }

  async updateDocument(filePath: string): Promise<void> {
    const server = await this.ensureFile(filePath);
    if (!server?.connection) return;
    const uri = pathToUri(filePath, this.workspaceRoot);
    if (!server.openDocuments.has(uri)) {
      await this.openDocument(server, filePath);
      return;
    }
    const text = await fs.readFile(toAbsolutePath(filePath, this.workspaceRoot), 'utf-8');
    const version = (this.documentVersions.get(uri) ?? 0) + 1;
    this.documentTexts.set(uri, text);
    this.documentVersions.set(uri, version);
    server.connection.sendNotification(DidChangeTextDocumentNotification.method, {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
  }

  private async ensureFile(filePath: string): Promise<ManagedServer | undefined> {
    if (!this.config.enabled) return undefined;
    const name = this.findServerName(filePath);
    if (!name) return undefined;
    const server = this.servers.get(name);
    if (!server) return undefined;
    await this.startServer(name);
    if (server.status === 'ready') {
      await this.openDocument(server, filePath);
    }
    return server;
  }

  private findServerName(filePath: string): string | undefined {
    for (const [name, server] of this.servers) {
      if (serverMatchesFile(server.config, filePath, this.workspaceRoot)) return name;
    }
    return undefined;
  }

  private async startServer(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (!server || server.status === 'ready' || server.status === 'starting') return;
    if (server.config.enabled === false || this.config.enabled === false) return;

    server.status = 'starting';
    server.error = undefined;
    try {
      const { child, connection } = await startLspConnection({
        workspaceRoot: this.workspaceRoot,
        config: server.config,
        connectionFactory: this.connectionFactory,
      });
      server.child = child;
      server.connection = connection;
      connection.onNotification(PublishDiagnosticsNotification.method, (params) => {
        this.handleDiagnostics(params as PublishDiagnosticsParams);
      });
      await connection.sendRequest<InitializeResult>(InitializeRequest.method, this.initializeParams());
      connection.sendNotification(InitializedNotification.method, {});
      server.status = 'ready';
    } catch (err) {
      server.status = 'error';
      server.error = err instanceof Error ? err.message : String(err);
      await this.stopServer(server);
    }
  }

  private initializeParams(): InitializeParams {
    return {
      processId: process.pid,
      rootUri: pathToUri(this.workspaceRoot, this.workspaceRoot),
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

  private async openDocument(server: ManagedServer, filePath: string): Promise<void> {
    if (!server.connection) return;
    const absolute = toAbsolutePath(filePath, this.workspaceRoot);
    const uri = pathToUri(absolute, this.workspaceRoot);
    if (server.openDocuments.has(uri)) return;
    const text = await fs.readFile(absolute, 'utf-8');
    const version = (this.documentVersions.get(uri) ?? 0) + 1;
    this.documentTexts.set(uri, text);
    this.documentVersions.set(uri, version);
    server.openDocuments.add(uri);
    server.connection.sendNotification(DidOpenTextDocumentNotification.method, {
      textDocument: {
        uri,
        languageId: languageId(filePath),
        version,
        text,
      },
    });
  }

  private handleDiagnostics(params: PublishDiagnosticsParams): void {
    const diagnostics = normalizeDiagnostics(params.diagnostics, params.uri, this.workspaceRoot, this.config.diagnosticsLimit);
    this.diagnostics.set(params.uri, diagnostics);
  }

  private async stopServer(server: ManagedServer): Promise<void> {
    server.status = 'stopped';
    try {
      if (server.connection) {
        try {
          await server.connection.sendRequest(ShutdownRequest.method);
        } catch {
          // Ignore shutdown failures during cleanup.
        }
        server.connection.sendNotification(ExitNotification.method);
        server.connection.dispose();
      }
    } finally {
      if (server.child && !server.child.killed) {
        server.child.kill();
      }
      server.child = undefined;
      server.connection = undefined;
      server.openDocuments.clear();
    }
  }
}

function toPosition(line: number, character: number): Position {
  return { line: line - 1, character: character - 1 };
}

function normalizeLocations(
  result: Location[] | Location | LocationLink[] | null,
  workspaceRoot: string,
): LspLocation[] {
  const items = Array.isArray(result) ? result : (result ? [result] : []);
  return items.flatMap((item) => {
    if ('targetUri' in item) {
      return [{
        uri: item.targetUri,
        filePath: uriToPath(item.targetUri),
        range: item.targetRange,
      }];
    }
    return [{
      uri: item.uri,
      filePath: uriToPath(item.uri),
      range: item.range,
    }];
  }).map((location) => ({
    ...location,
    filePath: relativePath(location.filePath, workspaceRoot),
  }));
}

function normalizeRange(range: Range, uri: string, workspaceRoot: string): LspLocation {
  return {
    uri,
    filePath: relativePath(uriToPath(uri), workspaceRoot),
    range,
  };
}

function normalizeDocumentSymbols(
  symbols: DocumentSymbol[] | SymbolInformation[],
  workspaceRoot: string,
): LspDocumentSymbol[] {
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

function normalizeWorkspaceSymbols(
  symbols: WorkspaceSymbol[],
  workspaceRoot: string,
): LspWorkspaceSymbol[] {
  return symbols.map((symbol) => {
    const loc = 'location' in symbol ? symbol.location : undefined;
    const uri = loc && 'uri' in loc ? loc.uri : '';
    const range: Range = loc && 'range' in loc
      ? loc.range as Range
      : { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
    return {
      name: symbol.name,
      kind: String(symbol.kind),
      location: normalizeRange(range, uri, workspaceRoot),
      containerName: 'containerName' in symbol ? symbol.containerName : undefined,
    };
  });
}

function formatHoverContents(contents: Hover['contents']): string {
  if (typeof contents === 'string') return contents;
  if ('value' in contents) return contents.value;
  if (Array.isArray(contents)) return contents.map(formatMarkedString).join('\n\n');
  return formatMarkedString(contents);
}

function formatMarkedString(value: MarkedString): string {
  if (typeof value === 'string') return value;
  return value.value;
}

function languageId(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
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

export function formatLspOperationResult<T>(data: T, formatted: string, fallback?: string): LspOperationResult<T> {
  return { data, formatted, fallback };
}
