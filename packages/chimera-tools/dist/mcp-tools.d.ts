/**
 * MCP tool integration — loads configured MCP servers and adapts their
 * tools into Chimera ToolDefinitions so they contribute to `allTools`.
 *
 * Config is discovered in (a) `<workspaceRoot>/.mcp.json`,
 * (b) `<workspaceRoot>/.chimera/mcp.json`, or (c) an explicit config path
 * passed via the `CHIMERA_MCP_CONFIG` environment variable. Servers that
 * fail to connect are skipped with a warning so startup never crashes on
 * one bad server.
 */
import type { ToolDefinition } from './tool-schema.js';
/**
 * Load and connect every configured MCP server, returning the adapted
 * Chimera ToolDefinitions. Failures are logged and skipped.
 */
export declare function initializeMcpTools(workspaceRoot: string): Promise<ToolDefinition[]>;
//# sourceMappingURL=mcp-tools.d.ts.map