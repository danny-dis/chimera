import { AgentYaml } from './agent-schema.js';
export interface AgentLoadError {
    path: string;
    errorType: 'read_error' | 'parse_error' | 'validation_error';
    message: string;
}
export interface AgentLoadResult {
    agents: AgentYaml[];
    errors: AgentLoadError[];
}
/**
 * Load a single agent YAML file.
 */
export declare function loadAgentFile(filePath: string): Promise<AgentYaml>;
/**
 * Load agent YAML files from a directory (recursive, depth-capped).
 */
export declare function loadAgentsFromDir(dirPath: string, depth?: number): Promise<AgentLoadResult>;
/**
 * Discover agent YAML files from standard locations.
 * Search order: project .chimera/agents/ → bundled defaults
 */
export declare function discoverAgents(projectRoot: string, options?: {
    agentsDir?: string;
}): Promise<AgentLoadResult>;
/**
 * Find an agent by name from a list of loaded agents.
 */
export declare function findAgentByName(agents: AgentYaml[], name: string): AgentYaml | undefined;
/**
 * Filter agents by role.
 */
export declare function filterAgentsByRole(agents: AgentYaml[], role: string): AgentYaml[];
//# sourceMappingURL=agent-loader.d.ts.map