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

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { McpClient, McpManager } from './mcp-client.js';
import type { McpConfigFile, McpServerConfig } from './mcp-client.js';
import type { ToolDefinition } from './tool-schema.js';

/**
 * Locate an MCP config file for the given workspace root.
 * Priority: explicit CHIMERA_MCP_CONFIG env, `<root>/.mcp.json`,
 * `<root>/.chimera/mcp.json`. Returns the path or null if none exist.
 */
function resolveConfigPath(workspaceRoot: string): string | null {
  const explicit = process.env.CHIMERA_MCP_CONFIG;
  if (explicit && existsSync(explicit)) return explicit;

  const rootConfig = path.join(workspaceRoot, '.mcp.json');
  if (existsSync(rootConfig)) return rootConfig;

  const chimeraConfig = path.join(workspaceRoot, '.chimera', 'mcp.json');
  if (existsSync(chimeraConfig)) return chimeraConfig;

  return null;
}

/**
 * Load and connect every configured MCP server, returning the adapted
 * Chimera ToolDefinitions. Failures are logged and skipped.
 */
export async function initializeMcpTools(workspaceRoot: string): Promise<ToolDefinition[]> {
  const configPath = resolveConfigPath(workspaceRoot);
  if (!configPath) return [];

  let parsed: McpConfigFile;
  try {
    const raw = readFileSync(configPath, 'utf-8');
    parsed = JSON.parse(raw) as McpConfigFile;
  } catch (err) {
    console.warn(`[mcp] failed to read config "${configPath}": ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }

  if (!parsed.mcpServers || Object.keys(parsed.mcpServers).length === 0) return [];

  const configs: McpServerConfig[] = McpManager.loadConfigFile(parsed);
  const tools: ToolDefinition[] = [];

  for (const serverConfig of configs) {
    if (serverConfig.enabled === false) continue;
    try {
      const client = new McpClient(serverConfig);
      await client.connect();
      tools.push(...client.toToolDefinitions());
      console.log(`[mcp] connected to "${serverConfig.name}" (${client.getTools().length} tools)`);
    } catch (err) {
      console.warn(`[mcp] skipping server "${serverConfig.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return tools;
}
