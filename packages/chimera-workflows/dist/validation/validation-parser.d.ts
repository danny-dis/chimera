export interface ValidationResult {
    check: string;
    result: 'pass' | 'fail' | 'warn' | 'unknown';
    error?: string;
}
export declare function parseValidationResults(content: string): ValidationResult[];
//# sourceMappingURL=validation-parser.d.ts.map