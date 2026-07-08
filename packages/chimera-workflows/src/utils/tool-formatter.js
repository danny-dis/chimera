"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatToolCall = formatToolCall;
/**
 * Format tool calls for logging/display.
 */
function formatToolCall(toolName, args) {
    const argStr = JSON.stringify(args);
    const truncated = argStr.length > 200 ? argStr.slice(0, 200) + '...' : argStr;
    return `${toolName}(${truncated})`;
}
//# sourceMappingURL=tool-formatter.js.map