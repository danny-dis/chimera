/**
 * Extract the clean response from writer output, discarding all
 * reasoning, analysis scaffolding, and JSON schema echoes.
 *
 * Returns the response text, or empty string if extraction fails.
 * Empty string signals the caller to degrade rather than display garbage.
 */
export declare function sanitizeWriterOutput(raw: string): string;
//# sourceMappingURL=output-sanitizer.d.ts.map