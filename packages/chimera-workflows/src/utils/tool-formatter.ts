/**
 * Format tool calls for logging/display.
 */
export function formatToolCall(toolName: string, args: Record<string, unknown>): string {
  const argStr = JSON.stringify(args);
  const truncated = argStr.length > 200 ? argStr.slice(0, 200) + '...' : argStr;
  return `${toolName}(${truncated})`;
}
