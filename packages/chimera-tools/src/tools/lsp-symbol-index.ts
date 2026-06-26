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

import { promises as fs } from 'fs';
import path from 'path';
import ts from 'typescript';

// ── Public types ──────────────────────────────────────────────────────────────

/** LSP SymbolKind values for the small subset we surface. */
export type SymbolKind =
  | 'File'
  | 'Module'
  | 'Namespace'
  | 'Class'
  | 'Method'
  | 'Property'
  | 'Function'
  | 'Variable'
  | 'Interface'
  | 'Enum'
  | 'EnumMember'
  | 'TypeAlias'
  | 'Constructor';

/** A symbol record extracted from a source file. */
export interface IndexSymbol {
  name: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number; // 1-based, matches LSP convention
  startColumn: number; // 1-based
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

// ── Implementation ───────────────────────────────────────────────────────────

const SUPPORTED_EXTENSIONS = new Set(['.ts', '.tsx']);
const HOVER_PREVIEW_LENGTH = 240;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.turbo', '.next', 'coverage']);

function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function nodeStart(node: ts.Node): { line: number; column: number } {
  const { line, character } = ts.getLineAndCharacterOfPosition(
    node.getSourceFile(),
    node.getStart(),
  );
  return { line: line + 1, column: character + 1 };
}

function nodeEnd(node: ts.Node): { line: number; column: number } {
  const { line, character } = ts.getLineAndCharacterOfPosition(
    node.getSourceFile(),
    node.getEnd(),
  );
  return { line: line + 1, column: character + 1 };
}

function toLocation(
  filePath: string,
  start: { line: number; column: number },
  end: { line: number; column: number },
): LspLocation {
  return { filePath, startLine: start.line, startColumn: start.column, endLine: end.line, endColumn: end.column };
}

function declarationType(node: ts.Node): SymbolKind {
  switch (node.kind) {
    case ts.SyntaxKind.ClassDeclaration: return 'Class';
    case ts.SyntaxKind.MethodDeclaration:
    case ts.SyntaxKind.MethodSignature: return 'Method';
    case ts.SyntaxKind.PropertyDeclaration:
    case ts.SyntaxKind.PropertySignature:
    case ts.SyntaxKind.PropertyAssignment: return 'Property';
    case ts.SyntaxKind.FunctionDeclaration:
    case ts.SyntaxKind.FunctionExpression:
    case ts.SyntaxKind.ArrowFunction: return 'Function';
    case ts.SyntaxKind.VariableStatement: return 'Variable';
    case ts.SyntaxKind.InterfaceDeclaration: return 'Interface';
    case ts.SyntaxKind.EnumDeclaration: return 'Enum';
    case ts.SyntaxKind.EnumMember: return 'EnumMember';
    case ts.SyntaxKind.TypeAliasDeclaration: return 'TypeAlias';
    case ts.SyntaxKind.Constructor: return 'Constructor';
    case ts.SyntaxKind.ModuleDeclaration: return 'Namespace';
    default: return 'Variable';
  }
}

function declarationName(node: ts.Node): string | undefined {
  // VariableStatement: the name is on the inner VariableDeclaration(s).
  if (ts.isVariableStatement(node)) {
    const first = node.declarationList.declarations[0];
    if (first && ts.isIdentifier(first.name)) return first.name.text;
    return undefined;
  }
  const decl = node as ts.NamedDeclaration;
  const name = decl.name;
  if (name && ts.isIdentifier(name)) return name.text;
  return undefined;
}

function buildHover(node: ts.Node, sourceFile: ts.SourceFile): string {
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const declText = printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
  const trimmed = declText.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= HOVER_PREVIEW_LENGTH) return trimmed;
  return trimmed.slice(0, HOVER_PREVIEW_LENGTH) + '…';
}

function jsDocOf(node: ts.Node): string | undefined {
  const jsDoc = (node as any).jsDoc as ReadonlyArray<ts.JSDoc> | undefined;
  if (!jsDoc || jsDoc.length === 0) return undefined;
  const parts: string[] = [];
  for (const tag of jsDoc) {
    if (typeof tag.comment === 'string') {
      parts.push(tag.comment);
    } else if (Array.isArray(tag.comment)) {
      for (const part of tag.comment) {
        if (typeof part === 'string') parts.push(part);
        else if ('text' in part) parts.push(part.text);
      }
    }
  }
  return parts.length ? parts.join('\n') : undefined;
}

/** Is this node a top-level / class-member declaration we want to surface? */
function isDeclarableKind(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.ClassDeclaration ||
    kind === ts.SyntaxKind.InterfaceDeclaration ||
    kind === ts.SyntaxKind.EnumDeclaration ||
    kind === ts.SyntaxKind.TypeAliasDeclaration ||
    kind === ts.SyntaxKind.FunctionDeclaration ||
    kind === ts.SyntaxKind.ModuleDeclaration ||
    kind === ts.SyntaxKind.VariableStatement ||
    kind === ts.SyntaxKind.EnumMember ||
    kind === ts.SyntaxKind.MethodDeclaration ||
    kind === ts.SyntaxKind.MethodSignature ||
    kind === ts.SyntaxKind.PropertyDeclaration ||
    kind === ts.SyntaxKind.PropertySignature ||
    kind === ts.SyntaxKind.Constructor
  );
}

// ── Identifier collection (for findReferences) ───────────────────────────────

function collectIdentifiers(sourceFile: ts.SourceFile, out: Map<string, ts.Node[]>): void {
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text) {
      const list = out.get(node.text) ?? [];
      list.push(node);
      out.set(node.text, list);
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sourceFile, visit);
}

// ── Cross-file reference resolution ──────────────────────────────────────────

interface IndexEntry {
  /** Absolute path using the OS's native separator (backslashes on Windows). */
  filePath: string;
  sourceFile: ts.SourceFile;
  symbols: IndexSymbol[];
  /** Identifier text → list of (identifier node) usages in this file. */
  identifiers: Map<string, ts.Node[]>;
}

/**
 * LspSymbolIndex — the main indexer. Instantiate with an absolute workspace
 * root, then call `indexDir()` to build the initial index. Subsequent calls
 * to `indexFile()` re-index single files.
 */
export class LspSymbolIndex {
  private readonly workspaceRoot: string;
  private readonly entries = new Map<string, IndexEntry>(); // absolute path → entry

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  /** Number of indexed files. */
  get size(): number {
    return this.entries.size;
  }

  /** Return all currently indexed files (absolute paths). */
  indexedFiles(): string[] {
    return Array.from(this.entries.keys());
  }

  /** Index a single file. Replaces any existing entry. */
  async indexFile(filePath: string): Promise<void> {
    const absolute = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.workspaceRoot, filePath);
    if (!isSupportedFile(absolute)) return;

    let source: string;
    try {
      source = await fs.readFile(absolute, 'utf-8');
    } catch {
      // File missing — drop any cached entry.
      this.entries.delete(absolute);
      return;
    }

    const sourceFile = ts.createSourceFile(
      absolute,
      source,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      absolute.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const symbols: IndexSymbol[] = [];
    collectDeclarations(sourceFile, absolute, undefined, symbols);

    const identifiers = new Map<string, ts.Node[]>();
    collectIdentifiers(sourceFile, identifiers);

    this.entries.set(absolute, { filePath: absolute, sourceFile, symbols, identifiers });
  }

  /** Recursively index all .ts/.tsx files under `dirPath` (defaults to workspace root). */
  async indexDir(dirPath?: string): Promise<number> {
    const target = dirPath
      ? (path.isAbsolute(dirPath) ? dirPath : path.resolve(this.workspaceRoot, dirPath))
      : this.workspaceRoot;

    let stat;
    try {
      stat = await fs.stat(target);
    } catch {
      throw new Error(`Directory not found: ${target}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${target}`);
    }

    const files: string[] = [];
    await this.walk(target, files);

    for (const f of files) {
      await this.indexFile(f);
    }
    return this.entries.size;
  }

  private async walk(dir: string, out: string[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(full, out);
      } else if (entry.isFile() && isSupportedFile(entry.name)) {
        out.push(full);
      }
    }
  }

  /** Clear the index. */
  clear(): void {
    this.entries.clear();
  }

  // ── Lookup operations ─────────────────────────────────────────────────────

  findDefinition(symbol: string): LspLocation[] {
    return this.lookupSymbol(symbol).map((s) => toLocation(
      s.filePath,
      { line: s.startLine, column: s.startColumn },
      { line: s.endLine, column: s.endColumn },
    ));
  }

  findReferences(symbol: string): LspLocation[] {
    const declarations = this.lookupSymbol(symbol);
    if (declarations.length === 0) return [];

    // Build a set of declaration positions for fast de-dup.
    const declKeys = new Set<string>();
    for (const d of declarations) {
      declKeys.add(`${d.filePath}:${d.startLine}:${d.startColumn}`);
    }

    const results: LspLocation[] = [];
    const seen = new Set<string>();

    // 1) Walk every identifier across the workspace and collect those that
    // match the target. We rely on the per-file `identifiers` map so the
    //    pass is O(usages), not O(N) for every symbol.
    for (const entry of this.entries.values()) {
      const usages = entry.identifiers.get(symbol);
      if (!usages) continue;
      for (const usage of usages) {
        const start = nodeStart(usage);
        const key = `${entry.filePath}:${start.line}:${start.column}`;
        if (seen.has(key)) continue;
        // De-dup: the declaration name is itself an identifier in the file.
        if (declKeys.has(key)) continue;
        seen.add(key);
        results.push(toLocation(
          entry.filePath,
          { line: start.line, column: start.column },
          { line: start.line, column: start.column + symbol.length },
        ));
      }
    }

    // 2) Always include the declarations themselves, even if the file's
    //    identifier map didn't surface the binding name (e.g. it was inside
    //    a destructuring pattern).
    for (const decl of declarations) {
      const key = `${decl.filePath}:${decl.startLine}:${decl.startColumn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(toLocation(
        decl.filePath,
        { line: decl.startLine, column: decl.startColumn },
        { line: decl.endLine, column: decl.endColumn },
      ));
    }

    return results;
  }

  getHover(symbol: string): LspHover | null {
    const declarations = this.lookupSymbol(symbol);
    if (declarations.length === 0) return null;
    const decl = declarations[0];
    const text = decl.documentation
      ? `${decl.hoverText ?? ''}\n\n${decl.documentation}`
      : (decl.hoverText ?? `Symbol: ${decl.name}`);
    return {
      contents: text,
      range: toLocation(
        decl.filePath,
        { line: decl.startLine, column: decl.startColumn },
        { line: decl.endLine, column: decl.endColumn },
      ),
    };
  }

  getDocumentSymbols(filePath: string): LspDocumentSymbol[] {
    const absolute = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.workspaceRoot, filePath);
    const entry = this.entries.get(absolute);
    if (!entry) return [];

    // Top-level: every symbol with no containerName. Children are looked up
    // by the parent's *name* (we tag methods/properties with containerName =
    // the enclosing class/interface name during collection).
    const topLevel: LspDocumentSymbol[] = [];
    const byContainer = new Map<string, LspDocumentSymbol[]>();

    for (const sym of entry.symbols) {
      const loc = toLocation(
        sym.filePath,
        { line: sym.startLine, column: sym.startColumn },
        { line: sym.endLine, column: sym.endColumn },
      );
      const node: LspDocumentSymbol = { name: sym.name, kind: sym.kind, range: loc };
      if (sym.containerName) {
        const list = byContainer.get(sym.containerName) ?? [];
        list.push(node);
        byContainer.set(sym.containerName, list);
      } else {
        topLevel.push(node);
      }
    }

    for (const node of topLevel) {
      const children = byContainer.get(node.name);
      if (children) node.children = children;
    }
    return topLevel;
  }

  getWorkspaceSymbols(query: string): LspWorkspaceSymbol[] {
    const needle = query.toLowerCase();
    const results: LspWorkspaceSymbol[] = [];
    for (const entry of this.entries.values()) {
      for (const sym of entry.symbols) {
        if (!sym.name.toLowerCase().includes(needle)) continue;
        results.push({
          name: sym.name,
          kind: sym.kind,
          location: toLocation(
            sym.filePath,
            { line: sym.startLine, column: sym.startColumn },
            { line: sym.endLine, column: sym.endColumn },
          ),
          containerName: sym.containerName ?? (path.relative(this.workspaceRoot, sym.filePath) || undefined),
        });
      }
    }
    return results;
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private lookupSymbol(symbol: string): IndexSymbol[] {
    const matches: IndexSymbol[] = [];
    for (const entry of this.entries.values()) {
      for (const sym of entry.symbols) {
        if (sym.name === symbol) matches.push(sym);
      }
    }
    return matches;
  }
}

// ── AST walker that harvests symbol records ──────────────────────────────────

/**
 * Walk a SourceFile and emit one `IndexSymbol` per declaration we want to
 * surface. Tags nested members with the enclosing class/interface as their
 * `containerName` so `getDocumentSymbols()` can rebuild the tree.
 */
function collectDeclarations(
  sourceFile: ts.SourceFile,
  filePath: string,
  container: string | undefined,
  out: IndexSymbol[],
): void {
  // Top-level pass: statements directly under the SourceFile.
  ts.forEachChild(sourceFile, (node) => {
    visitTopLevel(node, filePath, container, out);
  });
}

function visitTopLevel(node: ts.Node, filePath: string, container: string | undefined, out: IndexSymbol[]): void {
  if (isDeclarableKind(node.kind)) {
    const name = declarationName(node);
    if (name) {
      const start = nodeStart(node);
      const end = nodeEnd(node);
      const kind = declarationType(node);
      out.push({
        name,
        kind,
        filePath,
        startLine: start.line,
        startColumn: start.column,
        endLine: end.line,
        endColumn: end.column,
        containerName: container,
        hoverText: buildHover(node, node.getSourceFile()),
        documentation: jsDocOf(node),
      });
    }

    // Recurse into the body for member declarations.
    if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      for (const member of node.members) {
        visitMember(member, filePath, name, out);
      }
    }
    if (ts.isModuleDeclaration(node)) {
      const body = node.body;
      if (body && ts.isModuleBlock(body)) {
        for (const stmt of body.statements) {
          visitTopLevel(stmt, filePath, name, out);
        }
      }
    }
    if (ts.isEnumDeclaration(node) && name) {
      for (const m of node.members) {
        visitMember(m, filePath, name, out);
      }
    }
  }
}

function visitMember(member: ts.Node, filePath: string, container: string | undefined, out: IndexSymbol[]): void {
  if (!isDeclarableKind(member.kind)) return;
  const name = declarationName(member);
  if (!name) return;
  const start = nodeStart(member);
  const end = nodeEnd(member);
  out.push({
    name,
    kind: declarationType(member),
    filePath,
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
    containerName: container,
    hoverText: buildHover(member, member.getSourceFile()),
    documentation: jsDocOf(member),
  });
}
