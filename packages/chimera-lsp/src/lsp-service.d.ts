import type { ChildProcessWithoutNullStreams } from 'child_process';
import type { LspConnection } from './connection.js';
import type { LspDiagnostic, LspDocumentSymbol, LspHover, LspLocation, LspOperationResult, LspServerConfig, LspServerStatus, LspService, LspWorkspaceConfig, LspWorkspaceSymbol } from './types.js';
export interface LspServiceOptions {
    config?: LspWorkspaceConfig;
    configPath?: string;
    connectionFactory?: (child: ChildProcessWithoutNullStreams, config: LspServerConfig) => Promise<LspConnection>;
}
export declare class ChimeraLspService implements LspService {
    private readonly workspaceRoot;
    private readonly configPath?;
    private readonly connectionFactory?;
    private config;
    private readonly servers;
    private readonly diagnostics;
    private readonly documentVersions;
    private readonly documentTexts;
    constructor(workspaceRoot: string, options?: LspServiceOptions);
    start(): Promise<void>;
    dispose(): Promise<void>;
    status(): Array<{
        name: string;
        status: LspServerStatus;
        error?: string;
    }>;
    getDiagnostics(filePath: string): Promise<LspDiagnostic[]>;
    goToDefinition(filePath: string, line: number, character: number): Promise<LspLocation[]>;
    findReferences(filePath: string, line: number, character: number, includeDeclaration?: boolean): Promise<LspLocation[]>;
    hover(filePath: string, line: number, character: number): Promise<LspHover | null>;
    documentSymbols(filePath: string): Promise<LspDocumentSymbol[]>;
    workspaceSymbols(query: string): Promise<LspWorkspaceSymbol[]>;
    updateDocument(filePath: string): Promise<void>;
    private ensureFile;
    private findServerName;
    private startServer;
    private initializeParams;
    private openDocument;
    private handleDiagnostics;
    private stopServer;
}
export declare function formatLspOperationResult<T>(data: T, formatted: string, fallback?: string): LspOperationResult<T>;
//# sourceMappingURL=lsp-service.d.ts.map