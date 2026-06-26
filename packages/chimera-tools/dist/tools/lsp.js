"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lspTool = void 0;
const zod_1 = require("zod");
const tool_builder_js_1 = require("../tool-builder.js");
const lsp_1 = require("@chimera/lsp");
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
// ── Service cache ─────────────────────────────────────────────────────────────
const serviceCache = new Map();
async function getService(workspaceRoot) {
    let service = serviceCache.get(workspaceRoot);
    if (!service) {
        service = new lsp_1.ChimeraLspService(workspaceRoot);
        await service.start();
        serviceCache.set(workspaceRoot, service);
    }
    return service;
}
// ── Formatters ────────────────────────────────────────────────────────────────
function formatLocations(locations) {
    if (locations.length === 0)
        return 'No results found.';
    return locations
        .map((loc) => `${loc.filePath}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`)
        .join('\n');
}
function formatHover(hover) {
    if (!hover)
        return 'No hover information.';
    return hover.contents;
}
function formatDocumentSymbols(symbols, indent = 0) {
    if (symbols.length === 0)
        return 'No symbols found.';
    const lines = [];
    for (const sym of symbols) {
        const prefix = '  '.repeat(indent);
        lines.push(`${prefix}${sym.kind} ${sym.name} (line ${sym.range.range.start.line + 1})`);
        if (sym.children && sym.children.length > 0) {
            lines.push(formatDocumentSymbols(sym.children, indent + 1));
        }
    }
    return lines.join('\n');
}
function formatWorkspaceSymbols(symbols) {
    if (symbols.length === 0)
        return 'No symbols found.';
    return symbols
        .map((sym) => {
        const container = sym.containerName ? ` in ${sym.containerName}` : '';
        return `${sym.kind} ${sym.name}${container} — ${sym.location.filePath}:${sym.location.range.start.line + 1}:${sym.location.range.start.character + 1}`;
    })
        .join('\n');
}
function toRecord(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }
    return { value };
}
// ── Tool ──────────────────────────────────────────────────────────────────────
exports.lspTool = (0, tool_builder_js_1.buildTool)({
    name: 'lsp',
    description: 'Code intelligence via Language Server Protocol: go-to-definition, find-references, hover, document symbols, workspace symbols',
    parameters: LspParamsSchema,
    returns: LspReturnsSchema,
    category: 'lsp',
    permissionLevel: 'read',
    execute: async (params, context) => {
        const service = await getService(context.workspaceRoot);
        switch (params.operation) {
            case 'goToDefinition': {
                if (params.line == null || params.character == null) {
                    throw new Error('line and character are required for goToDefinition');
                }
                const locations = await service.goToDefinition(params.filePath, params.line, params.character);
                return {
                    operation: 'goToDefinition',
                    results: locations.map(toRecord),
                    formatted: formatLocations(locations),
                };
            }
            case 'findReferences': {
                if (params.line == null || params.character == null) {
                    throw new Error('line and character are required for findReferences');
                }
                const locations = await service.findReferences(params.filePath, params.line, params.character);
                return {
                    operation: 'findReferences',
                    results: locations.map(toRecord),
                    formatted: formatLocations(locations),
                };
            }
            case 'hover': {
                if (params.line == null || params.character == null) {
                    throw new Error('line and character are required for hover');
                }
                const hover = await service.hover(params.filePath, params.line, params.character);
                return {
                    operation: 'hover',
                    results: hover ? [toRecord(hover)] : [],
                    formatted: formatHover(hover),
                };
            }
            case 'documentSymbol': {
                const symbols = await service.documentSymbols(params.filePath);
                return {
                    operation: 'documentSymbol',
                    results: symbols.map(toRecord),
                    formatted: formatDocumentSymbols(symbols),
                };
            }
            case 'workspaceSymbol': {
                if (params.query == null) {
                    throw new Error('query is required for workspaceSymbol');
                }
                const symbols = await service.workspaceSymbols(params.query);
                return {
                    operation: 'workspaceSymbol',
                    results: symbols.map(toRecord),
                    formatted: formatWorkspaceSymbols(symbols),
                };
            }
        }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
});
//# sourceMappingURL=lsp.js.map