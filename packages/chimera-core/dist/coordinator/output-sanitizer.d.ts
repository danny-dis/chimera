/**
 * Extract a clean, human-readable summary from reviewer JSON output.
 * Discards internal reasoning fields (thought, findings details) and
 * returns only the verdict line suitable for display.
 *
 * Returns the clean summary, or the raw text if parsing fails.
 */
export declare function sanitizeReviewerOutput(raw: string): string;
/**
 * Extract the clean response from writer output, discarding all
 * reasoning, analysis scaffolding, and JSON schema echoes.
 *
 * Returns the response text, or empty string if extraction fails.
 * Empty string signals the caller to degrade rather than display garbage.
 */
export declare function sanitizeWriterOutput(raw: string): string;
//# sourceMappingURL=output-sanitizer.d.ts.map