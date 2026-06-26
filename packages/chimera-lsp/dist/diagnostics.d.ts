import type { Diagnostic } from 'vscode-languageserver-protocol';
import type { LspDiagnostic } from './types.js';
export declare function toLspDiagnostic(diagnostic: Diagnostic, documentUri: string): LspDiagnostic;
export declare function normalizeDiagnostics(diagnostics: readonly Diagnostic[], documentUri: string, workspaceRoot: string, limit?: number): LspDiagnostic[];
export declare function formatDiagnostics(diagnostics: readonly LspDiagnostic[]): string;
//# sourceMappingURL=diagnostics.d.ts.map