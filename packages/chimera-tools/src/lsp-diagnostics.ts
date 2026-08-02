import path from 'path';
import type { LspDiagnostic } from '@chimera/lsp';
import { getOrCreateLspService } from './lsp-registry.js';

export interface LspDiagnosticIssue {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  line?: number;
  column?: number;
  source?: string;
}

const SEVERITY_MAP: Record<number, LspDiagnosticIssue['severity']> = {
  1: 'error',
  2: 'warning',
  3: 'info',
  4: 'hint',
};

function toIssue(diagnostic: LspDiagnostic): LspDiagnosticIssue {
  const severity = diagnostic.severity != null ? (SEVERITY_MAP[diagnostic.severity] ?? 'info') : 'info';
  return {
    severity,
    message: diagnostic.message,
    line: diagnostic.range?.start?.line != null ? diagnostic.range.start.line + 1 : undefined,
    column: diagnostic.range?.start?.character != null ? diagnostic.range.start.character + 1 : undefined,
    source: diagnostic.source,
  };
}

export async function getDiagnosticsForFile(
  workspaceRoot: string,
  filePath: string,
): Promise<LspDiagnosticIssue[]> {
  try {
    const service = await getOrCreateLspService(workspaceRoot);
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(workspaceRoot, filePath);
    const diagnostics = await service.getDiagnostics(resolved);
    return diagnostics.map(toIssue);
  } catch {
    return [];
  }
}
