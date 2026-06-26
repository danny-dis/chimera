import type { Diagnostic } from 'vscode-languageserver-protocol';
import type { LspDiagnostic } from './types.js';
import { relativePath, uriToPath } from './uri.js';

const SEVERITY_ORDER: Record<number, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
};

export function toLspDiagnostic(
  diagnostic: Diagnostic,
  documentUri: string,
): LspDiagnostic {
  return {
    uri: documentUri,
    filePath: uriToPath(documentUri),
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

export function normalizeDiagnostics(
  diagnostics: readonly Diagnostic[],
  documentUri: string,
  workspaceRoot: string,
  limit = 200,
): LspDiagnostic[] {
  return diagnostics
    .map((diagnostic) => {
      const lspDiag = toLspDiagnostic(diagnostic, documentUri);
      return { ...lspDiag, filePath: relativePath(lspDiag.filePath, workspaceRoot) };
    })
    .sort((a, b) => {
      const severity = (SEVERITY_ORDER[a.severity ?? 4] ?? 4) - (SEVERITY_ORDER[b.severity ?? 4] ?? 4);
      if (severity !== 0) return severity;
      if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
      return a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character;
    })
    .slice(0, limit);
}

export function formatDiagnostics(diagnostics: readonly LspDiagnostic[]): string {
  if (diagnostics.length === 0) return 'No LSP diagnostics.';
  return diagnostics.map((diagnostic) => {
    const severity = severityLabel(diagnostic.severity);
    const location = `${diagnostic.filePath}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}`;
    const source = diagnostic.source ? ` [${diagnostic.source}]` : '';
    const code = diagnostic.code ? ` (${diagnostic.code})` : '';
    return `${location}: ${severity}${source}${code}: ${diagnostic.message}`;
  }).join('\n');
}

function severityLabel(severity?: number): string {
  switch (severity) {
    case 1: return 'error';
    case 2: return 'warning';
    case 3: return 'information';
    case 4: return 'hint';
    default: return 'diagnostic';
  }
}
