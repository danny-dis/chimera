import { promises as fs } from 'fs';
import path from 'path';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import type {
  DocumentSymbol,
  Hover,
  InitializeParams,
  InitializeResult,
  Location,
  LocationLink,
  MarkedString,
  Position,
  PublishDiagnosticsParams,
  Range,
  SymbolInformation,
  WorkspaceSymbol,
} from 'vscode-languageserver-protocol';
import { DEFAULT_LSP_CONFIG, loadLspConfig, mergeLspConfig } from './config.js';
import { normalizeDiagnostics } from './diagnostics.js';
import type { LspConnection } from './connection.js';
import { startLspConnection, terminateLspProcess } from './connection.js';
import { captureLspProcessTree } from './windows-process-tree.js';
import { serverMatchesFile } from './server-config.js';
import type { LspDiagnostic, LspDocumentSymbol, LspHover, LspLocation, LspOperationResult, LspServerConfig, LspServerStatus, LspService, LspWorkspaceConfig, LspWorkspaceSymbol } from './types.js';
import { pathToUri, relativePath, toAbsolutePath, uriToPath } from './uri.js';
const protocol = () => require('vscode-languageserver-protocol') as typeof import('vscode-languageserver-protocol');

interface ManagedServer {
  name: string;
  config: LspServerConfig;
  status: LspServerStatus;
  error?: string;
  child?: ChildProcessWithoutNullStreams;
  connection?: LspConnection;
  startupCleanup?: () => Promise<void>;
  openDocuments: Set<string>;
}

export interface LspServiceOptions {
  config?: LspWorkspaceConfig;
  configPath?: string;
  requestTimeoutMs?: number;
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
  private readonly startInFlight = new Map<string, Promise<void>>();
  private readonly documentSyncs = new Map<string, Promise<void>>();
  private readonly requestTimeoutMs: number;
  private disposed = false;
  private disposal?: Promise<void>;
  private readonly onProcessExit = () => {
    for (const server of this.servers.values()) server.child?.kill();
  };

  constructor(workspaceRoot: string, options: LspServiceOptions = {}) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.configPath = options.configPath;
    this.connectionFactory = options.connectionFactory;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    if (!Number.isFinite(this.requestTimeoutMs) || this.requestTimeoutMs <= 0) throw new Error('Invalid LSP request timeout');
    process.once('exit', this.onProcessExit);
    this.config = options.config ?? DEFAULT_LSP_CONFIG;
    for (const [name, server] of Object.entries(this.config.servers)) {
      this.servers.set(name, { name, config: server, status: 'idle', openDocuments: new Set() });
    }
  }

  async start(): Promise<void> {
    if (this.disposed) throw new Error('LSP service disposed');
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

  dispose(): Promise<void> {
    this.disposed = true;
    if (!this.disposal) {
      const pending = this.disposeServers();
      this.disposal = pending;
      void pending.catch(() => { if (this.disposal === pending) this.disposal = undefined; });
    }
    return this.disposal;
  }

  private async disposeServers(): Promise<void> {
    await Promise.allSettled([...this.startInFlight.values()]);
    const stopped = await Promise.allSettled([...this.servers.values()].map((server) => this.stopServer(server)));
    const failures = stopped.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length) {
      const reasons = failures.map(result => result.reason);
      const message = reasons.map(reason => reason instanceof Error ? reason.message : String(reason)).join('; ');
      throw new AggregateError(reasons, `LSP shutdown failed: ${message}`);
    }
    process.removeListener('exit', this.onProcessExit);
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
    const uri = pathToUri(filePath, this.workspaceRoot);
    const result = await server.connection!.sendRequest<Location[] | Location | LocationLink[] | null>(
      protocol().DefinitionRequest.method,
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
    const uri = pathToUri(filePath, this.workspaceRoot);
    const result = await server.connection!.sendRequest<Location[] | null>(
      protocol().ReferencesRequest.method,
      { textDocument: { uri }, position: toPosition(line, character), context: { includeDeclaration } },
    );
    return normalizeLocations(result ?? [], this.workspaceRoot);
  }

  async hover(filePath: string, line: number, character: number): Promise<LspHover | null> {
    const server = await this.ensureFile(filePath);
    const uri = pathToUri(filePath, this.workspaceRoot);
    const result = await server.connection!.sendRequest<Hover | null>(
      protocol().HoverRequest.method,
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
    const uri = pathToUri(filePath, this.workspaceRoot);
    const result = await server.connection!.sendRequest<DocumentSymbol[] | SymbolInformation[] | null>(
      protocol().DocumentSymbolRequest.method,
      { textDocument: { uri } },
    );
    return normalizeDocumentSymbols(result ?? [], this.workspaceRoot, uri);
  }

  async workspaceSymbols(query: string): Promise<LspWorkspaceSymbol[]> {
    // Explicit unavailable — never silent [] for disabled or failed startup.
    // Legitimate successful empty (ready servers, no matches) still returns [].
    if (this.config.enabled === false) {
      throw new Error(`LSP disabled for workspace ${this.workspaceRoot}`);
    }
    await this.start();
    const ready = [...this.servers.values()].filter((s) => s.status === 'ready' && s.connection);
    if (ready.length === 0) {
      const detail = this.status().map((s) => `${s.name}:${s.status}${s.error ? `(${s.error})` : ''}`).join(', ') || 'no servers configured';
      throw new Error(`LSP server unavailable for workspace ${this.workspaceRoot}: ${detail}`);
    }
    const results: LspWorkspaceSymbol[] = [];
    for (const server of ready) {
      const result = await server.connection!.sendRequest<WorkspaceSymbol[] | null>(
        protocol().WorkspaceSymbolRequest.method,
        { query },
      );
      results.push(...normalizeWorkspaceSymbols(result ?? [], this.workspaceRoot));
    }
    return results;
  }

  async updateDocument(filePath: string): Promise<void> {
    await this.ensureFile(filePath);
  }

  private async ensureFile(filePath: string): Promise<ManagedServer> {
    // Canonical containment FIRST — before any startup or read. Covers
    // relative traversal, absolute outside, file: URI outside, and
    // symlink/junction escape via realpath.
    await assertWorkspaceContainment(filePath, this.workspaceRoot);
    // Explicit unavailable — never silent []/null for these three cases.
    // Legitimate successful empty (ready server, query matched nothing)
    // still returns []/null from the callers above.
    if (this.config.enabled === false) {
      throw new Error(`LSP disabled for workspace ${this.workspaceRoot}`);
    }
    const name = this.findServerName(filePath);
    if (!name) {
      throw new Error(`No LSP server configured for file ${filePath} in workspace ${this.workspaceRoot}`);
    }
    const server = this.servers.get(name);
    if (!server) {
      throw new Error(`No LSP server configured for file ${filePath} in workspace ${this.workspaceRoot}`);
    }
    await this.startServer(name);
    if (server.status !== 'ready' || !server.connection) {
      throw new Error(`LSP server '${name}' unavailable: ${server.error ?? server.status}`);
    }
    await this.openDocument(server, filePath);
    return server;
  }

  private findServerName(filePath: string): string | undefined {
    for (const [name, server] of this.servers) {
      if (serverMatchesFile(server.config, filePath, this.workspaceRoot)) return name;
    }
    return undefined;
  }

  private async startServer(name: string): Promise<void> {
    if (this.disposed) throw new Error('LSP service disposed');
    const existing = this.startInFlight.get(name);
    if (existing) {
      await existing.catch(() => undefined);
      return;
    }
    const server = this.servers.get(name);
    if (!server || server.status === 'ready' || server.status === 'starting') return;
    if (server.config.enabled === false || this.config.enabled === false) return;

    const pending = this.doStartServer(server).finally(() => {
      if (this.startInFlight.get(name) === pending) this.startInFlight.delete(name);
    });
    this.startInFlight.set(name, pending);
    await pending.catch(() => undefined);
  }

  private async doStartServer(server: ManagedServer): Promise<void> {
    server.status = 'starting';
    server.error = undefined;
    try {
      if (server.child || server.connection || server.startupCleanup) await this.stopServer(server);
      const { child, connection } = await startLspConnection({
        workspaceRoot: this.workspaceRoot,
        config: server.config,
        connectionFactory: this.connectionFactory,
        requestTimeoutMs: this.requestTimeoutMs,
      });
      server.child = child;
      server.connection = connection;
      connection.onNotification(protocol().PublishDiagnosticsNotification.method, (params) => {
        this.handleDiagnostics(params as PublishDiagnosticsParams);
      });
      await connection.sendRequest<InitializeResult>(protocol().InitializeRequest.method, this.initializeParams(server.config));
      if (this.disposed) throw new Error('LSP service disposed');
      await connection.sendNotification(protocol().InitializedNotification.method, {});
      server.status = 'ready';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err && typeof err === 'object' && 'child' in err) {
        server.child = err.child as ChildProcessWithoutNullStreams;
      }
      if (err && typeof err === 'object' && 'connection' in err) {
        server.connection = err.connection as LspConnection | undefined;
      }
      if (err && typeof err === 'object' && 'cleanup' in err) {
        server.startupCleanup = err.cleanup as () => Promise<void>;
      }
      server.status = 'error';
      server.error = message;
      try { await this.stopServer(server); }
      finally { server.status = 'error'; }
    }
  }

  private initializeParams(config: LspServerConfig): InitializeParams {
    return {
      processId: process.pid,
      initializationOptions: config.initializationOptions,
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
    const key = `${server.name}:${pathToUri(filePath, this.workspaceRoot)}`;
    const existing = this.documentSyncs.get(key);
    if (existing) { await existing; return this.openDocument(server, filePath); }
    const pending = this.syncDocument(server, filePath);
    this.documentSyncs.set(key, pending);
    try { await pending; }
    finally { if (this.documentSyncs.get(key) === pending) this.documentSyncs.delete(key); }
  }

  private async syncDocument(server: ManagedServer, filePath: string): Promise<void> {
    if (!server.connection) return;
    const absolute = toAbsolutePath(filePath, this.workspaceRoot);
    const uri = pathToUri(absolute, this.workspaceRoot);
    const text = await fs.readFile(absolute, 'utf-8');
    if (!server.openDocuments.has(uri)) {
      const version = (this.documentVersions.get(uri) ?? 0) + 1;
      await server.connection.sendNotification(protocol().DidOpenTextDocumentNotification.method, {
        textDocument: {
          uri,
          languageId: languageIdForPath(absolute),
          version,
          text,
        },
      });
      this.documentTexts.set(uri, text);
      this.documentVersions.set(uri, version);
      server.openDocuments.add(uri);
      return;
    }
    // Stale-document repair: every query re-syncs via didChange so the
    // server never reads a stale snapshot. Reuses existing version/text
    // maps; no new sync machinery.
    if (this.documentTexts.get(uri) !== text) {
      const version = (this.documentVersions.get(uri) ?? 0) + 1;
      await server.connection.sendNotification(protocol().DidChangeTextDocumentNotification.method, {
        textDocument: { uri, version },
        contentChanges: [{ text }],
      });
      this.documentTexts.set(uri, text);
      this.documentVersions.set(uri, version);
    }
  }

  private handleDiagnostics(params: PublishDiagnosticsParams): void {
    const diagnostics = normalizeDiagnostics(params.diagnostics, params.uri, this.workspaceRoot, this.config.diagnosticsLimit);
    this.diagnostics.set(params.uri, diagnostics);
  }

  private async stopServer(server: ManagedServer): Promise<void> {
    server.status = 'stopped';
    const connection = server.connection;
    const child = server.child;
    try {
      if (child) await captureLspProcessTree(child);
      if (server.startupCleanup) {
        await server.startupCleanup();
        server.startupCleanup = undefined;
      }
      if (connection) {
        try {
          await connection.sendRequest(protocol().ShutdownRequest.method);
        } catch {
          // Ignore shutdown failures during cleanup.
        }
        try { await connection.sendNotification(protocol().ExitNotification.method); }
        finally {
          connection.dispose();
          if (server.connection === connection) server.connection = undefined;
          server.openDocuments.clear();
        }
      }
    } finally {
      if (child) await terminateLspProcess(child);
      if (server.child === child) server.child = undefined;
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
  documentUri: string,
): LspDocumentSymbol[] {
  return symbols.map((symbol) => {
    if ('location' in symbol) {
      return {
        name: symbol.name,
        kind: String(symbol.kind),
        range: normalizeRange(symbol.location.range, symbol.location.uri, workspaceRoot),
      };
    }
    // Hierarchical DocumentSymbol has no per-symbol URI — it belongs to
    // the requesting document. Thread the document URI through instead
    // of synthesizing a placeholder.
    return {
      name: symbol.name,
      kind: String(symbol.kind),
      range: normalizeRange(symbol.range, documentUri, workspaceRoot),
      children: symbol.children ? normalizeDocumentSymbols(symbol.children, workspaceRoot, documentUri) : undefined,
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

function isAbsolutePath(p: string): boolean {
  return p.match(/^[A-Za-z]:[\\/]/) !== null || p.startsWith('\\\\') || p.startsWith('/');
}

function isWithinRoot(resolved: string, root: string): boolean {
  // Windows paths (and vscode-uri fsPath drive letters) are
  // case-insensitive — normalize case before the prefix check so
  // `c:\...` vs `C:\...` does not false-positive as an escape.
  if (process.platform === 'win32') {
    const r = path.normalize(resolved).toLowerCase();
    const b = path.normalize(root).toLowerCase();
    return r === b || r.startsWith(b + path.sep.toLowerCase());
  }
  return resolved === root || resolved.startsWith(root + path.sep);
}

/**
 * Canonical workspace containment — enforced at the service boundary
 * before any server startup or file read. Covers relative traversal,
 * absolute paths outside the root, file: URIs outside the root, and
 * symlink/junction escape via realpath (including symlinked ancestor
 * dirs for not-yet-existing files). Exported so the tool seam reuses
 * the same check without duplicating helpers.
 */
export async function assertWorkspaceContainment(filePath: string, workspaceRoot: string): Promise<void> {
  const root = path.resolve(workspaceRoot);
  const absolute = filePath.startsWith('file:') ? uriToPath(filePath) : isAbsolutePath(filePath)
    ? path.normalize(filePath)
    : path.resolve(root, filePath);
  if (!isWithinRoot(path.normalize(absolute), root)) {
    throw new Error(`path escapes workspace: ${filePath}`);
  }
  // Canonicalize symlinks. realpath the file when it exists; otherwise
  // realpath the nearest existing ancestor and re-attach the remainder so
  // a symlinked dir + new file cannot escape.
  let canonical = absolute;
  try {
    canonical = await fs.realpath(absolute);
  } catch {
    let dir = path.dirname(absolute);
    let suffix: string[] = [path.basename(absolute)];
    while (dir !== path.dirname(dir)) {
      try {
        const realDir = await fs.realpath(dir);
        canonical = path.join(realDir, ...suffix.reverse());
        break;
      } catch {
        suffix.push(path.basename(dir));
        dir = path.dirname(dir);
      }
    }
    if (canonical === absolute) {
      try {
        const realRoot = await fs.realpath(root);
        if (realRoot !== root && isWithinRoot(path.normalize(absolute), realRoot)) return;
      } catch {
        // Root realpath unavailable — fall through to lexical check.
      }
      return;
    }
  }
  const realRoot = await fs.realpath(root).catch(() => root);
  if (!isWithinRoot(path.normalize(canonical), path.normalize(realRoot))) {
    throw new Error(`path escapes workspace via symlink: ${filePath}`);
  }
  if (!isWithinRoot(path.normalize(canonical), root) && !isWithinRoot(path.normalize(canonical), path.normalize(realRoot))) {
    throw new Error(`path escapes workspace via symlink: ${filePath}`);
  }
}

function languageIdForPath(filePath: string): string {
  const decoded = filePath.startsWith('file:') ? uriToPath(filePath) : filePath;
  return languageId(decoded);
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
