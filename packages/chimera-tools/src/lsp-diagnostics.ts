import path from 'path';
import { ChimeraLspService } from '@chimera/lsp';
import type { LspDiagnostic, LspService } from '@chimera/lsp';

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
  let service: LspService;
  try {
    service = new ChimeraLspService(workspaceRoot);
    await service.start();
  } catch {
    return [];
  }

  try {
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(workspaceRoot, filePath);
    const diagnostics = await service.getDiagnostics(resolved);
    return diagnostics.map(toIssue);
  } catch {
    return [];
  } finally {
    await service.dispose().catch(() => undefined);
  }
}

export function formatDiagnostics(diags: LspDiagnosticIssue[]): string {
  if (diags.length === 0) return 'No LSP diagnostics.';
  return diags
    .map((d) => {
      const location = d.line != null ? `${d.line}:${d.column ?? 1}` : '(unknown)';
      const source = d.source ? ` [${d.source}]` : '';
      return `${location}: ${d.severity}${source}: ${d.message}`;
    })
    .join('\n');
}
