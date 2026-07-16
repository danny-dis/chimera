export interface LspDiagnosticIssue {
    severity: 'error' | 'warning' | 'info' | 'hint';
    message: string;
    line?: number;
    column?: number;
    source?: string;
}
export declare function getDiagnosticsForFile(workspaceRoot: string, filePath: string): Promise<LspDiagnosticIssue[]>;
export declare function formatDiagnostics(diags: LspDiagnosticIssue[]): string;
//# sourceMappingURL=lsp-diagnostics.d.ts.map