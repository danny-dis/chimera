"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDiagnosticsForFile = getDiagnosticsForFile;
exports.formatDiagnostics = formatDiagnostics;
const path_1 = __importDefault(require("path"));
const lsp_1 = require("@chimera/lsp");
const SEVERITY_MAP = {
    1: 'error',
    2: 'warning',
    3: 'info',
    4: 'hint',
};
function toIssue(diagnostic) {
    const severity = diagnostic.severity != null ? (SEVERITY_MAP[diagnostic.severity] ?? 'info') : 'info';
    return {
        severity,
        message: diagnostic.message,
        line: diagnostic.range?.start?.line != null ? diagnostic.range.start.line + 1 : undefined,
        column: diagnostic.range?.start?.character != null ? diagnostic.range.start.character + 1 : undefined,
        source: diagnostic.source,
    };
}
async function getDiagnosticsForFile(workspaceRoot, filePath) {
    let service;
    try {
        service = new lsp_1.ChimeraLspService(workspaceRoot);
        await service.start();
    }
    catch {
        return [];
    }
    try {
        const resolved = path_1.default.isAbsolute(filePath) ? filePath : path_1.default.resolve(workspaceRoot, filePath);
        const diagnostics = await service.getDiagnostics(resolved);
        return diagnostics.map(toIssue);
    }
    catch {
        return [];
    }
    finally {
        await service.dispose().catch(() => undefined);
    }
}
function formatDiagnostics(diags) {
    if (diags.length === 0)
        return 'No LSP diagnostics.';
    return diags
        .map((d) => {
        const location = d.line != null ? `${d.line}:${d.column ?? 1}` : '(unknown)';
        const source = d.source ? ` [${d.source}]` : '';
        return `${location}: ${d.severity}${source}: ${d.message}`;
    })
        .join('\n');
}
//# sourceMappingURL=lsp-diagnostics.js.map