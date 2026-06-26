"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LspSymbolIndex = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const typescript_1 = __importDefault(require("typescript"));
// ── Implementation ───────────────────────────────────────────────────────────
const SUPPORTED_EXTENSIONS = new Set(['.ts', '.tsx']);
const HOVER_PREVIEW_LENGTH = 240;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.turbo', '.next', 'coverage']);
function isSupportedFile(filePath) {
    return SUPPORTED_EXTENSIONS.has(path_1.default.extname(filePath).toLowerCase());
}
function nodeStart(node) {
    const { line, character } = typescript_1.default.getLineAndCharacterOfPosition(node.getSourceFile(), node.getStart());
    return { line: line + 1, column: character + 1 };
}
function nodeEnd(node) {
    const { line, character } = typescript_1.default.getLineAndCharacterOfPosition(node.getSourceFile(), node.getEnd());
    return { line: line + 1, column: character + 1 };
}
function toLocation(filePath, start, end) {
    return { filePath, startLine: start.line, startColumn: start.column, endLine: end.line, endColumn: end.column };
}
function declarationType(node) {
    switch (node.kind) {
        case typescript_1.default.SyntaxKind.ClassDeclaration: return 'Class';
        case typescript_1.default.SyntaxKind.MethodDeclaration:
        case typescript_1.default.SyntaxKind.MethodSignature: return 'Method';
        case typescript_1.default.SyntaxKind.PropertyDeclaration:
        case typescript_1.default.SyntaxKind.PropertySignature:
        case typescript_1.default.SyntaxKind.PropertyAssignment: return 'Property';
        case typescript_1.default.SyntaxKind.FunctionDeclaration:
        case typescript_1.default.SyntaxKind.FunctionExpression:
        case typescript_1.default.SyntaxKind.ArrowFunction: return 'Function';
        case typescript_1.default.SyntaxKind.VariableStatement: return 'Variable';
        case typescript_1.default.SyntaxKind.InterfaceDeclaration: return 'Interface';
        case typescript_1.default.SyntaxKind.EnumDeclaration: return 'Enum';
        case typescript_1.default.SyntaxKind.EnumMember: return 'EnumMember';
        case typescript_1.default.SyntaxKind.TypeAliasDeclaration: return 'TypeAlias';
        case typescript_1.default.SyntaxKind.Constructor: return 'Constructor';
        case typescript_1.default.SyntaxKind.ModuleDeclaration: return 'Namespace';
        default: return 'Variable';
    }
}
function declarationName(node) {
    // VariableStatement: the name is on the inner VariableDeclaration(s).
    if (typescript_1.default.isVariableStatement(node)) {
        const first = node.declarationList.declarations[0];
        if (first && typescript_1.default.isIdentifier(first.name))
            return first.name.text;
        return undefined;
    }
    const decl = node;
    const name = decl.name;
    if (name && typescript_1.default.isIdentifier(name))
        return name.text;
    return undefined;
}
function buildHover(node, sourceFile) {
    const printer = typescript_1.default.createPrinter({ newLine: typescript_1.default.NewLineKind.LineFeed });
    const declText = printer.printNode(typescript_1.default.EmitHint.Unspecified, node, sourceFile);
    const trimmed = declText.replace(/\s+/g, ' ').trim();
    if (trimmed.length <= HOVER_PREVIEW_LENGTH)
        return trimmed;
    return trimmed.slice(0, HOVER_PREVIEW_LENGTH) + '…';
}
function jsDocOf(node) {
    const jsDoc = node.jsDoc;
    if (!jsDoc || jsDoc.length === 0)
        return undefined;
    const parts = [];
    for (const tag of jsDoc) {
        if (typeof tag.comment === 'string') {
            parts.push(tag.comment);
        }
        else if (Array.isArray(tag.comment)) {
            for (const part of tag.comment) {
                if (typeof part === 'string')
                    parts.push(part);
                else if ('text' in part)
                    parts.push(part.text);
            }
        }
    }
    return parts.length ? parts.join('\n') : undefined;
}
/** Is this node a top-level / class-member declaration we want to surface? */
function isDeclarableKind(kind) {
    return (kind === typescript_1.default.SyntaxKind.ClassDeclaration ||
        kind === typescript_1.default.SyntaxKind.InterfaceDeclaration ||
        kind === typescript_1.default.SyntaxKind.EnumDeclaration ||
        kind === typescript_1.default.SyntaxKind.TypeAliasDeclaration ||
        kind === typescript_1.default.SyntaxKind.FunctionDeclaration ||
        kind === typescript_1.default.SyntaxKind.ModuleDeclaration ||
        kind === typescript_1.default.SyntaxKind.VariableStatement ||
        kind === typescript_1.default.SyntaxKind.EnumMember ||
        kind === typescript_1.default.SyntaxKind.MethodDeclaration ||
        kind === typescript_1.default.SyntaxKind.MethodSignature ||
        kind === typescript_1.default.SyntaxKind.PropertyDeclaration ||
        kind === typescript_1.default.SyntaxKind.PropertySignature ||
        kind === typescript_1.default.SyntaxKind.Constructor);
}
// ── Identifier collection (for findReferences) ───────────────────────────────
function collectIdentifiers(sourceFile, out) {
    function visit(node) {
        if (typescript_1.default.isIdentifier(node) && node.text) {
            const list = out.get(node.text) ?? [];
            list.push(node);
            out.set(node.text, list);
        }
        typescript_1.default.forEachChild(node, visit);
    }
    typescript_1.default.forEachChild(sourceFile, visit);
}
/**
 * LspSymbolIndex — the main indexer. Instantiate with an absolute workspace
 * root, then call `indexDir()` to build the initial index. Subsequent calls
 * to `indexFile()` re-index single files.
 */
class LspSymbolIndex {
    workspaceRoot;
    entries = new Map(); // absolute path → entry
    constructor(workspaceRoot) {
        this.workspaceRoot = path_1.default.resolve(workspaceRoot);
    }
    /** Number of indexed files. */
    get size() {
        return this.entries.size;
    }
    /** Return all currently indexed files (absolute paths). */
    indexedFiles() {
        return Array.from(this.entries.keys());
    }
    /** Index a single file. Replaces any existing entry. */
    async indexFile(filePath) {
        const absolute = path_1.default.isAbsolute(filePath)
            ? filePath
            : path_1.default.resolve(this.workspaceRoot, filePath);
        if (!isSupportedFile(absolute))
            return;
        let source;
        try {
            source = await fs_1.promises.readFile(absolute, 'utf-8');
        }
        catch {
            // File missing — drop any cached entry.
            this.entries.delete(absolute);
            return;
        }
        const sourceFile = typescript_1.default.createSourceFile(absolute, source, typescript_1.default.ScriptTarget.Latest, 
        /* setParentNodes */ true, absolute.endsWith('.tsx') ? typescript_1.default.ScriptKind.TSX : typescript_1.default.ScriptKind.TS);
        const symbols = [];
        collectDeclarations(sourceFile, absolute, undefined, symbols);
        const identifiers = new Map();
        collectIdentifiers(sourceFile, identifiers);
        this.entries.set(absolute, { filePath: absolute, sourceFile, symbols, identifiers });
    }
    /** Recursively index all .ts/.tsx files under `dirPath` (defaults to workspace root). */
    async indexDir(dirPath) {
        const target = dirPath
            ? (path_1.default.isAbsolute(dirPath) ? dirPath : path_1.default.resolve(this.workspaceRoot, dirPath))
            : this.workspaceRoot;
        let stat;
        try {
            stat = await fs_1.promises.stat(target);
        }
        catch {
            throw new Error(`Directory not found: ${target}`);
        }
        if (!stat.isDirectory()) {
            throw new Error(`Not a directory: ${target}`);
        }
        const files = [];
        await this.walk(target, files);
        for (const f of files) {
            await this.indexFile(f);
        }
        return this.entries.size;
    }
    async walk(dir, out) {
        let entries;
        try {
            entries = await fs_1.promises.readdir(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name))
                continue;
            const full = path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                await this.walk(full, out);
            }
            else if (entry.isFile() && isSupportedFile(entry.name)) {
                out.push(full);
            }
        }
    }
    /** Clear the index. */
    clear() {
        this.entries.clear();
    }
    // ── Lookup operations ─────────────────────────────────────────────────────
    findDefinition(symbol) {
        return this.lookupSymbol(symbol).map((s) => toLocation(s.filePath, { line: s.startLine, column: s.startColumn }, { line: s.endLine, column: s.endColumn }));
    }
    findReferences(symbol) {
        const declarations = this.lookupSymbol(symbol);
        if (declarations.length === 0)
            return [];
        // Build a set of declaration positions for fast de-dup.
        const declKeys = new Set();
        for (const d of declarations) {
            declKeys.add(`${d.filePath}:${d.startLine}:${d.startColumn}`);
        }
        const results = [];
        const seen = new Set();
        // 1) Walk every identifier across the workspace and collect those that
        // match the target. We rely on the per-file `identifiers` map so the
        //    pass is O(usages), not O(N) for every symbol.
        for (const entry of this.entries.values()) {
            const usages = entry.identifiers.get(symbol);
            if (!usages)
                continue;
            for (const usage of usages) {
                const start = nodeStart(usage);
                const key = `${entry.filePath}:${start.line}:${start.column}`;
                if (seen.has(key))
                    continue;
                // De-dup: the declaration name is itself an identifier in the file.
                if (declKeys.has(key))
                    continue;
                seen.add(key);
                results.push(toLocation(entry.filePath, { line: start.line, column: start.column }, { line: start.line, column: start.column + symbol.length }));
            }
        }
        // 2) Always include the declarations themselves, even if the file's
        //    identifier map didn't surface the binding name (e.g. it was inside
        //    a destructuring pattern).
        for (const decl of declarations) {
            const key = `${decl.filePath}:${decl.startLine}:${decl.startColumn}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            results.push(toLocation(decl.filePath, { line: decl.startLine, column: decl.startColumn }, { line: decl.endLine, column: decl.endColumn }));
        }
        return results;
    }
    getHover(symbol) {
        const declarations = this.lookupSymbol(symbol);
        if (declarations.length === 0)
            return null;
        const decl = declarations[0];
        const text = decl.documentation
            ? `${decl.hoverText ?? ''}\n\n${decl.documentation}`
            : (decl.hoverText ?? `Symbol: ${decl.name}`);
        return {
            contents: text,
            range: toLocation(decl.filePath, { line: decl.startLine, column: decl.startColumn }, { line: decl.endLine, column: decl.endColumn }),
        };
    }
    getDocumentSymbols(filePath) {
        const absolute = path_1.default.isAbsolute(filePath)
            ? filePath
            : path_1.default.resolve(this.workspaceRoot, filePath);
        const entry = this.entries.get(absolute);
        if (!entry)
            return [];
        // Top-level: every symbol with no containerName. Children are looked up
        // by the parent's *name* (we tag methods/properties with containerName =
        // the enclosing class/interface name during collection).
        const topLevel = [];
        const byContainer = new Map();
        for (const sym of entry.symbols) {
            const loc = toLocation(sym.filePath, { line: sym.startLine, column: sym.startColumn }, { line: sym.endLine, column: sym.endColumn });
            const node = { name: sym.name, kind: sym.kind, range: loc };
            if (sym.containerName) {
                const list = byContainer.get(sym.containerName) ?? [];
                list.push(node);
                byContainer.set(sym.containerName, list);
            }
            else {
                topLevel.push(node);
            }
        }
        for (const node of topLevel) {
            const children = byContainer.get(node.name);
            if (children)
                node.children = children;
        }
        return topLevel;
    }
    getWorkspaceSymbols(query) {
        const needle = query.toLowerCase();
        const results = [];
        for (const entry of this.entries.values()) {
            for (const sym of entry.symbols) {
                if (!sym.name.toLowerCase().includes(needle))
                    continue;
                results.push({
                    name: sym.name,
                    kind: sym.kind,
                    location: toLocation(sym.filePath, { line: sym.startLine, column: sym.startColumn }, { line: sym.endLine, column: sym.endColumn }),
                    containerName: sym.containerName ?? (path_1.default.relative(this.workspaceRoot, sym.filePath) || undefined),
                });
            }
        }
        return results;
    }
    // ── Internal helpers ─────────────────────────────────────────────────────
    lookupSymbol(symbol) {
        const matches = [];
        for (const entry of this.entries.values()) {
            for (const sym of entry.symbols) {
                if (sym.name === symbol)
                    matches.push(sym);
            }
        }
        return matches;
    }
}
exports.LspSymbolIndex = LspSymbolIndex;
// ── AST walker that harvests symbol records ──────────────────────────────────
/**
 * Walk a SourceFile and emit one `IndexSymbol` per declaration we want to
 * surface. Tags nested members with the enclosing class/interface as their
 * `containerName` so `getDocumentSymbols()` can rebuild the tree.
 */
function collectDeclarations(sourceFile, filePath, container, out) {
    // Top-level pass: statements directly under the SourceFile.
    typescript_1.default.forEachChild(sourceFile, (node) => {
        visitTopLevel(node, filePath, container, out);
    });
}
function visitTopLevel(node, filePath, container, out) {
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
        if (typescript_1.default.isClassDeclaration(node) || typescript_1.default.isInterfaceDeclaration(node)) {
            for (const member of node.members) {
                visitMember(member, filePath, name, out);
            }
        }
        if (typescript_1.default.isModuleDeclaration(node)) {
            const body = node.body;
            if (body && typescript_1.default.isModuleBlock(body)) {
                for (const stmt of body.statements) {
                    visitTopLevel(stmt, filePath, name, out);
                }
            }
        }
        if (typescript_1.default.isEnumDeclaration(node) && name) {
            for (const m of node.members) {
                visitMember(m, filePath, name, out);
            }
        }
    }
}
function visitMember(member, filePath, container, out) {
    if (!isDeclarableKind(member.kind))
        return;
    const name = declarationName(member);
    if (!name)
        return;
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
//# sourceMappingURL=lsp-symbol-index.js.map