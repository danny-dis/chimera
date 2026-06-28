"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAgentFile = loadAgentFile;
exports.loadAgentsFromDir = loadAgentsFromDir;
exports.discoverAgents = discoverAgents;
exports.findAgentByName = findAgentByName;
exports.filterAgentsByRole = filterAgentsByRole;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const yaml_1 = require("yaml");
const agent_schema_js_1 = require("./agent-schema.js");
const MAX_DISCOVERY_DEPTH = 2;
const SUPPORTED_EXTENSIONS = ['.yaml', '.yml'];
/**
 * Load a single agent YAML file.
 */
async function loadAgentFile(filePath) {
    const content = await (0, promises_1.readFile)(filePath, 'utf-8');
    const parsed = (0, yaml_1.parse)(content);
    const result = (0, agent_schema_js_1.safeValidateAgentYaml)(parsed);
    if (!result.success) {
        const errorResult = result;
        const issues = errorResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new Error(`Validation failed for ${filePath}: ${issues}`);
    }
    return result.data;
}
/**
 * Load agent YAML files from a directory (recursive, depth-capped).
 */
async function loadAgentsFromDir(dirPath, depth = 0) {
    const agents = [];
    const errors = [];
    if (depth > MAX_DISCOVERY_DEPTH) {
        return { agents, errors };
    }
    let entries;
    try {
        entries = await (0, promises_1.readdir)(dirPath);
    }
    catch (error) {
        errors.push({
            path: dirPath,
            errorType: 'read_error',
            message: error instanceof Error ? error.message : 'Unknown read error',
        });
        return { agents, errors };
    }
    for (const entry of entries) {
        const fullPath = (0, node_path_1.join)(dirPath, entry);
        try {
            const stats = await (0, promises_1.stat)(fullPath);
            if (stats.isDirectory()) {
                const subResult = await loadAgentsFromDir(fullPath, depth + 1);
                agents.push(...subResult.agents);
                errors.push(...subResult.errors);
                continue;
            }
            if (!SUPPORTED_EXTENSIONS.includes((0, node_path_1.extname)(entry).toLowerCase())) {
                continue;
            }
            try {
                const agent = await loadAgentFile(fullPath);
                agents.push(agent);
            }
            catch (error) {
                errors.push({
                    path: fullPath,
                    errorType: error instanceof Error && error.message.includes('Validation failed')
                        ? 'validation_error'
                        : 'parse_error',
                    message: error instanceof Error ? error.message : 'Unknown parse error',
                });
            }
        }
        catch (error) {
            errors.push({
                path: fullPath,
                errorType: 'read_error',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
    return { agents, errors };
}
/**
 * Discover agent YAML files from standard locations.
 * Search order: project .chimera/agents/ → bundled defaults
 */
async function discoverAgents(projectRoot, options) {
    const agentsDir = options?.agentsDir ?? (0, node_path_1.join)(projectRoot, '.chimera', 'agents');
    return loadAgentsFromDir(agentsDir);
}
/**
 * Find an agent by name from a list of loaded agents.
 */
function findAgentByName(agents, name) {
    return agents.find(a => a.name === name);
}
/**
 * Filter agents by role.
 */
function filterAgentsByRole(agents, role) {
    return agents.filter(a => a.role === role);
}
//# sourceMappingURL=agent-loader.js.map