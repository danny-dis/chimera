export type LspServerStatus = 'idle' | 'starting' | 'ready' | 'error' | 'stopped';
export interface LspServerConfig {
    name?: string;
    command: string;
    args?: string[];
    cwd?: string;
    filePatterns?: string[];
    rootFiles?: string[];
    env?: Record<string, string>;
    enabled?: boolean;
    diagnosticsLimit?: number;
}
export interface LspWorkspaceConfig {
    enabled?: boolean;
    autoStart?: boolean;
    diagnosticsLimit?: number;
    servers: Record<string, LspServerConfig>;
}
export interface LspLocation {
    uri: string;
    filePath: string;
    range: {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    };
}
export interface LspDiagnostic extends LspLocation {
    severity?: number;
    source?: string;
    code?: string | number;
    message: string;
}
export interface LspHover {
    contents: string;
    range?: LspLocation;
}
export interface LspDocumentSymbol {
    name: string;
    kind: string;
    range: LspLocation;
    children?: LspDocumentSymbol[];
}
export interface LspWorkspaceSymbol {
    name: string;
    kind: string;
    location: LspLocation;
    containerName?: string;
}
export interface LspOperationResult<T> {
    formatted: string;
    data: T;
    fallback?: string;
}
export interface LspService {
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
}
//# sourceMappingURL=types.d.ts.map