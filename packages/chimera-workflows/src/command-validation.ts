/**
 * Validates a command name to prevent path traversal and enforce naming conventions.
 * Ported from research/archon/packages/workflows/src/command-validation.ts @ 2026-06-15.
 */
export function isValidCommandName(name: string): boolean {
  // Reject names with path separators or parent directory references
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    return false;
  }
  // Reject empty names or names starting with .
  if (!name || name.startsWith('.')) {
    return false;
  }
  return true;
}
