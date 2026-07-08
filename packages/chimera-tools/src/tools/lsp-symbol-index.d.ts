/**
 * LspSymbolIndex — in-process TypeScript symbol indexer.
 *
 * Built on the TypeScript compiler API. Indexes .ts/.tsx files in a workspace
 * and supports go-to-definition, find-references, hover, document-symbols,
 * and workspace-symbols lookups without spawning an external language server.
 *
 * The index is cached in memory. Files are re-indexed on demand when the
 * caller signals a change via `indexFile(filePath)`.
 */
/** LSP SymbolKind values for the small subset we surface. */
export type SymbolKind = 'File' | 'Module' | 'Namespace' | 'Class' | 'Method' | 'Property' | 'Function' | 'Variable' | 'Interface' | 'Enum' | 'EnumMember' | 'TypeAlias' | 'Constructor';
/** A symbol record extracted from a source file. */
export interface IndexSymbol {
    name: string;
    kind: SymbolKind;
    filePath: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
    containerName?: string;
    /** Surface text shown on hover (declaration / signature). */
    hoverText?: string;
    /** Optional type/JSdoc snippet used by hover. */
    documentation?: string;
}
/** A single location (file + range) in a source file. */
export interface LspLocation {
    filePath: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
}
/** Result of a hover lookup. */
export interface LspHover {
    contents: string;
    range?: LspLocation;
}
/** A hierarchical document symbol (with optional children). */
export interface LspDocumentSymbol {
    name: string;
    kind: SymbolKind;
    range: LspLocation;
    children?: LspDocumentSymbol[];
}
/** Workspace symbol — flat listing with a location + container. */
export interface LspWorkspaceSymbol {
    name: string;
    kind: SymbolKind;
    location: LspLocation;
    containerName?: string;
}
/**
 * LspSymbolIndex — the main indexer. Instantiate with an absolute workspace
 * root, then call `indexDir()` to build the initial index. Subsequent calls
 * to `indexFile()` re-index single files.
 */
export declare class LspSymbolIndex {
    private readonly workspaceRoot;
    private readonly entries;
    constructor(workspaceRoot: string);
    /** Number of indexed files. */
    get size(): number;
    /** Return all currently indexed files (absolute paths). */
    indexedFiles(): string[];
    /** Index a single file. Replaces any existing entry. */
    indexFile(filePath: string): Promise<void>;
    /** Recursively index all .ts/.tsx files under `dirPath` (defaults to workspace root). */
    indexDir(dirPath?: string): Promise<number>;
    private walk;
    /** Clear the index. */
    clear(): void;
    findDefinition(symbol: string): LspLocation[];
    findReferences(symbol: string): LspLocation[];
    getHover(symbol: string): LspHover | null;
    getDocumentSymbols(filePath: string): LspDocumentSymbol[];
    getWorkspaceSymbols(query: string): LspWorkspaceSymbol[];
    private lookupSymbol;
}
//# sourceMappingURL=lsp-symbol-index.d.ts.map