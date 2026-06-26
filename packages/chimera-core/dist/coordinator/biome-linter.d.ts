export interface LintDiagnostic {
    message: string;
    severity: 'error' | 'warning' | 'info';
    file?: string;
    line?: number;
    column?: number;
    rule?: string;
}
export interface LintResult {
    passed: boolean;
    errors: string[];
    warnings: string[];
    diagnostics: LintDiagnostic[];
    durationMs: number;
}
export interface BiomeLinterConfig {
    timeoutMs?: number;
    configPath?: string;
}
export declare class BiomeLinter {
    private config;
    private binary;
    constructor(config?: BiomeLinterConfig);
    lintCode(code: string, filename?: string): Promise<LintResult>;
    lintFile(filePath: string): Promise<LintResult>;
    private parseOutput;
}
//# sourceMappingURL=biome-linter.d.ts.map