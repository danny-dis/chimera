import type { ToolDefinition, ToolContext } from './tool-schema.js';
/**
 * Safe defaults for tool metadata.
 * - isEnabled: tool is always enabled
 * - isConcurrencySafe: tool is NOT concurrency safe (conservative)
 * - isReadOnly: tool is NOT read-only (conservative)
 * - isDestructive: tool is NOT destructive (safe)
 */
export declare const TOOL_DEFAULTS: {
    readonly isEnabled: (_params: unknown, _context: ToolContext) => boolean;
    readonly isConcurrencySafe: () => boolean;
    readonly isReadOnly: (_params: unknown, _context: ToolContext) => boolean;
    readonly isDestructive: (_params: unknown, _context: ToolContext) => boolean;
};
/**
 * Input type for buildTool — all core fields required, metadata fields optional.
 */
export type ToolDefinitionInput<P extends import('zod').ZodType = import('zod').ZodType, R extends import('zod').ZodType = import('zod').ZodType> = Omit<ToolDefinition<P, R>, 'isEnabled' | 'isConcurrencySafe' | 'isReadOnly' | 'isDestructive'> & Partial<Pick<ToolDefinition<P, R>, 'isEnabled' | 'isConcurrencySafe' | 'isReadOnly' | 'isDestructive'>>;
/**
 * Factory function that builds a complete ToolDefinition from a partial input.
 * Fills in safe defaults for any missing metadata fields.
 */
export declare function buildTool<P extends import('zod').ZodType, R extends import('zod').ZodType>(input: ToolDefinitionInput<P, R>): ToolDefinition<P, R>;
//# sourceMappingURL=tool-builder.d.ts.map