"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeMcpTools = initializeMcpTools;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const mcp_client_js_1 = require("./mcp-client.js");
/**
 * Locate an MCP config file for the given workspace root.
 * Priority: explicit CHIMERA_MCP_CONFIG env, `<root>/.mcp.json`,
 * `<root>/.chimera/mcp.json`. Returns the path or null if none exist.
 */
function resolveConfigPath(workspaceRoot) {
    const explicit = process.env.CHIMERA_MCP_CONFIG;
    if (explicit && (0, fs_1.existsSync)(explicit))
        return explicit;
    const rootConfig = path_1.default.join(workspaceRoot, '.mcp.json');
    if ((0, fs_1.existsSync)(rootConfig))
        return rootConfig;
    const chimeraConfig = path_1.default.join(workspaceRoot, '.chimera', 'mcp.json');
    if ((0, fs_1.existsSync)(chimeraConfig))
        return chimeraConfig;
    return null;
}
/**
 * Load and connect every configured MCP server, returning the adapted
 * Chimera ToolDefinitions. Failures are logged and skipped.
 */
async function initializeMcpTools(workspaceRoot) {
    const configPath = resolveConfigPath(workspaceRoot);
    if (!configPath)
        return [];
    let parsed;
    try {
        const raw = (0, fs_1.readFileSync)(configPath, 'utf-8');
        parsed = JSON.parse(raw);
    }
    catch (err) {
        console.warn(`[mcp] failed to read config "${configPath}": ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
    if (!parsed.mcpServers || Object.keys(parsed.mcpServers).length === 0)
        return [];
    const configs = mcp_client_js_1.McpManager.loadConfigFile(parsed);
    const tools = [];
    for (const serverConfig of configs) {
        if (serverConfig.enabled === false)
            continue;
        try {
            const client = new mcp_client_js_1.McpClient(serverConfig);
            await client.connect();
            tools.push(...client.toToolDefinitions());
            console.log(`[mcp] connected to "${serverConfig.name}" (${client.getTools().length} tools)`);
        }
        catch (err) {
            console.warn(`[mcp] skipping server "${serverConfig.name}": ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return tools;
}
//# sourceMappingURL=mcp-tools.js.map