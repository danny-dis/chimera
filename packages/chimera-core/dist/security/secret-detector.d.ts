/**
 * Patterns for common secrets and credentials.
 * Based on common formats for major cloud providers and tools.
 */
export declare const SECRET_PATTERNS: Record<string, RegExp>;
export interface SecretMatch {
    type: string;
    value: string;
    index: number;
}
/**
 * SecretDetector identifies and redacts sensitive information from strings.
 */
export declare class SecretDetector {
    /**
     * Detects secrets in the given text.
     */
    detectSecrets(text: string): SecretMatch[];
    /**
     * Redacts secrets from the given text.
     */
    redactSecrets(text: string): string;
}
//# sourceMappingURL=secret-detector.d.ts.map