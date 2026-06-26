"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toLspDiagnostic = toLspDiagnostic;
exports.normalizeDiagnostics = normalizeDiagnostics;
exports.formatDiagnostics = formatDiagnostics;
const uri_js_1 = require("./uri.js");
const SEVERITY_ORDER = {
    1: 0,
    2: 1,
    3: 2,
    4: 3,
};
function toLspDiagnostic(diagnostic, documentUri) {
    return {
        uri: documentUri,
        filePath: (0, uri_js_1.uriToPath)(documentUri),
        range: diagnostic.range,
        severity: diagnostic.severity,
        source: diagnostic.source,
        code: typeof diagnostic.code === 'string' || typeof diagnostic.code === 'number'
            ? diagnostic.code
            : undefined,
        message: typeof diagnostic.message === 'string'
            ? diagnostic.message
            : diagnostic.message.value,
    };
}
function normalizeDiagnostics(diagnostics, documentUri, workspaceRoot, limit = 200) {
    return diagnostics
        .map((diagnostic) => {
        const lspDiag = toLspDiagnostic(diagnostic, documentUri);
        return { ...lspDiag, filePath: (0, uri_js_1.relativePath)(lspDiag.filePath, workspaceRoot) };
    })
        .sort((a, b) => {
        const severity = (SEVERITY_ORDER[a.severity ?? 4] ?? 4) - (SEVERITY_ORDER[b.severity ?? 4] ?? 4);
        if (severity !== 0)
            return severity;
        if (a.filePath !== b.filePath)
            return a.filePath.localeCompare(b.filePath);
        return a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character;
    })
        .slice(0, limit);
}
function formatDiagnostics(diagnostics) {
    if (diagnostics.length === 0)
        return 'No LSP diagnostics.';
    return diagnostics.map((diagnostic) => {
        const severity = severityLabel(diagnostic.severity);
        const location = `${diagnostic.filePath}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}`;
        const source = diagnostic.source ? ` [${diagnostic.source}]` : '';
        const code = diagnostic.code ? ` (${diagnostic.code})` : '';
        return `${location}: ${severity}${source}${code}: ${diagnostic.message}`;
    }).join('\n');
}
function severityLabel(severity) {
    switch (severity) {
        case 1: return 'error';
        case 2: return 'warning';
        case 3: return 'information';
        case 4: return 'hint';
        default: return 'diagnostic';
    }
}
//# sourceMappingURL=diagnostics.js.map