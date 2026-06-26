"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lspTool = void 0;
const zod_1 = require("zod");
const path_1 = __importDefault(require("path"));
const tool_builder_js_1 = require("../tool-builder.js");
// ── Position helpers ──────────────────────────────────────────────────────────
/** Convert 1-based user position to 0-based LSP Position */
function toLspPosition(line, character) {
    return { line: line - 1, character: character - 1 };
}
/** Convert absolute file path to LSP DocumentUri (file:// scheme) */
function toDocumentUri(filePath, workspaceRoot) {
    const absolute = path_1.default.isAbsolute(filePath)
        ? filePath
        : path_1.default.resolve(workspaceRoot, filePath);
    return `file:///${absolute.replace(/\\/g, '/')}`;
}
async function mockGoToDefinition(_uri, _position, _workspaceRoot) {
    return [
        {
            uri: 'file:///src/example.ts',
            range: {
                start: { line: 10, character: 0 },
                end: { line: 10, character: 25 },
            },
        },
    ];
}
async function mockFindReferences(_uri, _position, _workspaceRoot) {
    return [
        {
            uri: 'file:///src/main.ts',
            range: {
                start: { line: 5, character: 2 },
                end: { line: 5, character: 15 },
            },
        },
        {
            uri: 'file:///src/utils.ts',
            range: {
                start: { line: 20, character: 8 },
                end: { line: 20, character: 21 },
            },
        },
    ];
}
async function mockHover(_uri, _position, _workspaceRoot) {
    return {
        contents: '(mock) function example(): void\n\nThis is a placeholder hover result.',
        range: {
            start: { line: _position.line, character: _position.character },
            end: { line: _position.line, character: _position.character + 7 },
        },
    };
}
async function mockDocumentSymbol(_uri, _workspaceRoot) {
    return [
        {
            name: 'MyClass',
            kind: 'Class',
            range: {
                start: { line: 0, character: 0 },
                end: { line: 50, character: 1 },
            },
            children: [
                {
                    name: 'constructor',
                    kind: 'Constructor',
                    range: {
                        start: { line: 1, character: 2 },
                        end: { line: 5, character: 3 },
                    },
                },
                {
                    name: 'doSomething',
                    kind: 'Method',
                    range: {
                        start: { line: 7, character: 2 },
                        end: { line: 15, character: 3 },
                    },
                },
            ],
        },
        {
            name: 'helperFunction',
            kind: 'Function',
            range: {
                start: { line: 52, character: 0 },
                end: { line: 60, character: 1 },
            },
        },
    ];
}
async function mockWorkspaceSymbol(_query, _workspaceRoot) {
    return [
        {
            name: 'MyClass',
            kind: 'Class',
            location: {
                uri: 'file:///src/index.ts',
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 50, character: 1 },
                },
            },
            containerName: 'src/index.ts',
        },
        {
            name: 'processData',
            kind: 'Function',
            location: {
                uri: 'file:///src/utils.ts',
                range: {
                    start: { line: 10, character: 0 },
                    end: { line: 25, character: 1 },
                },
            },
            containerName: 'src/utils.ts',
        },
    ];
}
// ── Result formatters ─────────────────────────────────────────────────────────
function formatLocation(loc, workspaceRoot) {
    const relative = path_1.default.relative(workspaceRoot, loc.uri.replace('file:///', '').replace(/\//g, '\\'));
    const { start, end } = loc.range;
    return `${relative}:${start.line + 1}:${start.character + 1}–${end.line + 1}:${end.character + 1}`;
}
function formatHover(hover) {
    return hover.contents;
}
function formatDocumentSymbol(sym, indent = 0) {
    const prefix = '  '.repeat(indent);
    const range = `${sym.range.start.line + 1}:${sym.range.start.character + 1}`;
    const lines = [`${prefix}${sym.kind} ${sym.name} @ line ${range}`];
    if (sym.children) {
        for (const child of sym.children) {
            lines.push(formatDocumentSymbol(child, indent + 1));
        }
    }
    return lines.join('\n');
}
function formatWorkspaceSymbol(sym, workspaceRoot) {
    const loc = formatLocation(sym.location, workspaceRoot);
    const container = sym.containerName ? ` (${sym.containerName})` : '';
    return `${sym.kind} ${sym.name}${container} @ ${loc}`;
}
// ── Schemas ───────────────────────────────────────────────────────────────────
const LspOperationSchema = zod_1.z.enum([
    'goToDefinition',
    'findReferences',
    'hover',
    'documentSymbol',
    'workspaceSymbol',
]);
const LspParamsSchema = zod_1.z.object({
    operation: LspOperationSchema,
    filePath: zod_1.z.string().min(1, 'filePath is required'),
    line: zod_1.z.number().int().positive().optional(),
    character: zod_1.z.number().int().positive().optional(),
    query: zod_1.z.string().optional(),
});
const LspReturnsSchema = zod_1.z.object({
    operation: zod_1.z.string(),
    results: zod_1.z.array(zod_1.z.record(zod_1.z.unknown())),
    formatted: zod_1.z.string(),
});
// ── Tool ──────────────────────────────────────────────────────────────────────
exports.lspTool = (0, tool_builder_js_1.buildTool)({
    name: 'lsp',
    description: 'Code intelligence via Language Server Protocol: go-to-definition, find-references, hover, document symbols, workspace symbols',
    parameters: LspParamsSchema,
    returns: LspReturnsSchema,
    category: 'lsp',
    permissionLevel: 'read',
    execute: async (params, context) => {
        const { operation, filePath, line, character, query } = params;
        const uri = toDocumentUri(filePath, context.workspaceRoot);
        switch (operation) {
            case 'goToDefinition': {
                if (line == null || character == null) {
                    throw new Error('line and character are required for goToDefinition');
                }
                const position = toLspPosition(line, character);
                const locations = await mockGoToDefinition(uri, position, context.workspaceRoot);
                const formatted = locations.length
                    ? locations.map((loc) => formatLocation(loc, context.workspaceRoot)).join('\n')
                    : 'No definitions found.';
                return {
                    operation,
                    results: locations.map((loc) => ({ uri: loc.uri, range: loc.range })),
                    formatted,
                };
            }
            case 'findReferences': {
                if (line == null || character == null) {
                    throw new Error('line and character are required for findReferences');
                }
                const position = toLspPosition(line, character);
                const locations = await mockFindReferences(uri, position, context.workspaceRoot);
                const formatted = locations.length
                    ? locations.map((loc) => formatLocation(loc, context.workspaceRoot)).join('\n')
                    : 'No references found.';
                return {
                    operation,
                    results: locations.map((loc) => ({ uri: loc.uri, range: loc.range })),
                    formatted,
                };
            }
            case 'hover': {
                if (line == null || character == null) {
                    throw new Error('line and character are required for hover');
                }
                const position = toLspPosition(line, character);
                const hover = await mockHover(uri, position, context.workspaceRoot);
                return {
                    operation,
                    results: [{ contents: hover.contents, range: hover.range }],
                    formatted: formatHover(hover),
                };
            }
            case 'documentSymbol': {
                const symbols = await mockDocumentSymbol(uri, context.workspaceRoot);
                const formatted = symbols.map((sym) => formatDocumentSymbol(sym)).join('\n');
                return {
                    operation,
                    results: symbols.map((sym) => ({ name: sym.name, kind: sym.kind, range: sym.range })),
                    formatted,
                };
            }
            case 'workspaceSymbol': {
                if (!query) {
                    throw new Error('query is required for workspaceSymbol');
                }
                const symbols = await mockWorkspaceSymbol(query, context.workspaceRoot);
                const formatted = symbols.length
                    ? symbols.map((sym) => formatWorkspaceSymbol(sym, context.workspaceRoot)).join('\n')
                    : 'No symbols found.';
                return {
                    operation,
                    results: symbols.map((sym) => ({
                        name: sym.name,
                        kind: sym.kind,
                        location: sym.location,
                        containerName: sym.containerName,
                    })),
                    formatted,
                };
            }
        }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
});
//# sourceMappingURL=lsp.js.map