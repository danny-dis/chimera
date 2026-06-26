"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_DEFAULTS = void 0;
exports.buildTool = buildTool;
/**
 * Safe defaults for tool metadata.
 * - isEnabled: tool is always enabled
 * - isConcurrencySafe: tool is NOT concurrency safe (conservative)
 * - isReadOnly: tool is NOT read-only (conservative)
 * - isDestructive: tool is NOT destructive (safe)
 */
exports.TOOL_DEFAULTS = {
    isEnabled: (_params, _context) => true,
    isConcurrencySafe: () => false,
    isReadOnly: (_params, _context) => false,
    isDestructive: (_params, _context) => false,
};
/**
 * Factory function that builds a complete ToolDefinition from a partial input.
 * Fills in safe defaults for any missing metadata fields.
 */
function buildTool(input) {
    return {
        ...input,
        isEnabled: input.isEnabled ?? exports.TOOL_DEFAULTS.isEnabled,
        isConcurrencySafe: input.isConcurrencySafe ?? exports.TOOL_DEFAULTS.isConcurrencySafe,
        isReadOnly: input.isReadOnly ?? exports.TOOL_DEFAULTS.isReadOnly,
        isDestructive: input.isDestructive ?? exports.TOOL_DEFAULTS.isDestructive,
    };
}
//# sourceMappingURL=tool-builder.js.map