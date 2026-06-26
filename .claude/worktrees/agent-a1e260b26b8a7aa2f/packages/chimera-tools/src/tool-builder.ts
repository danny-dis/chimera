import type { ToolDefinition, ToolContext } from './tool-schema.js';

/**
 * Safe defaults for tool metadata.
 * - isEnabled: tool is always enabled
 * - isConcurrencySafe: tool is NOT concurrency safe (conservative)
 * - isReadOnly: tool is NOT read-only (conservative)
 * - isDestructive: tool is NOT destructive (safe)
 */
export const TOOL_DEFAULTS = {
  isEnabled: (_params: unknown, _context: ToolContext): boolean => true,
  isConcurrencySafe: (): boolean => false,
  isReadOnly: (_params: unknown, _context: ToolContext): boolean => false,
  isDestructive: (_params: unknown, _context: ToolContext): boolean => false,
} as const;

/**
 * Input type for buildTool — all core fields required, metadata fields optional.
 */
export type ToolDefinitionInput<
  P extends import('zod').ZodType = import('zod').ZodType,
  R extends import('zod').ZodType = import('zod').ZodType,
> = Omit<ToolDefinition<P, R>, 'isEnabled' | 'isConcurrencySafe' | 'isReadOnly' | 'isDestructive'> &
  Partial<Pick<ToolDefinition<P, R>, 'isEnabled' | 'isConcurrencySafe' | 'isReadOnly' | 'isDestructive'>>;

/**
 * Factory function that builds a complete ToolDefinition from a partial input.
 * Fills in safe defaults for any missing metadata fields.
 */
export function buildTool<P extends import('zod').ZodType, R extends import('zod').ZodType>(
  input: ToolDefinitionInput<P, R>,
): ToolDefinition<P, R> {
  return {
    ...input,
    isEnabled: input.isEnabled ?? TOOL_DEFAULTS.isEnabled,
    isConcurrencySafe: input.isConcurrencySafe ?? TOOL_DEFAULTS.isConcurrencySafe,
    isReadOnly: input.isReadOnly ?? TOOL_DEFAULTS.isReadOnly,
    isDestructive: input.isDestructive ?? TOOL_DEFAULTS.isDestructive,
  };
}
