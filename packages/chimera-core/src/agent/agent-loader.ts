import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { AgentYaml, safeValidateAgentYaml } from './agent-schema.js';

export interface AgentLoadError {
  path: string;
  errorType: 'read_error' | 'parse_error' | 'validation_error';
  message: string;
}

export interface AgentLoadResult {
  agents: AgentYaml[];
  errors: AgentLoadError[];
}

const MAX_DISCOVERY_DEPTH = 2;
const SUPPORTED_EXTENSIONS = ['.yaml', '.yml'];

/**
 * Load a single agent YAML file.
 */
export async function loadAgentFile(filePath: string): Promise<AgentYaml> {
  const content = await readFile(filePath, 'utf-8');
  const parsed = parseYaml(content);
  const result = safeValidateAgentYaml(parsed);

  if (!result.success) {
    const errorResult = result as { success: false; error: { issues: Array<{ path: string[]; message: string }> } };
    const issues = errorResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Validation failed for ${filePath}: ${issues}`);
  }

  return result.data;
}

/**
 * Load agent YAML files from a directory (recursive, depth-capped).
 */
export async function loadAgentsFromDir(dirPath: string, depth = 0): Promise<AgentLoadResult> {
  const agents: AgentYaml[] = [];
  const errors: AgentLoadError[] = [];

  if (depth > MAX_DISCOVERY_DEPTH) {
    return { agents, errors };
  }

  let entries;
  try {
    entries = await readdir(dirPath);
  } catch (error) {
    errors.push({
      path: dirPath,
      errorType: 'read_error',
      message: error instanceof Error ? error.message : 'Unknown read error',
    });
    return { agents, errors };
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry);

    try {
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        const subResult = await loadAgentsFromDir(fullPath, depth + 1);
        agents.push(...subResult.agents);
        errors.push(...subResult.errors);
        continue;
      }

      if (!SUPPORTED_EXTENSIONS.includes(extname(entry).toLowerCase())) {
        continue;
      }

      try {
        const agent = await loadAgentFile(fullPath);
        agents.push(agent);
      } catch (error) {
        errors.push({
          path: fullPath,
          errorType: error instanceof Error && error.message.includes('Validation failed')
            ? 'validation_error'
            : 'parse_error',
          message: error instanceof Error ? error.message : 'Unknown parse error',
        });
      }
    } catch (error) {
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
export async function discoverAgents(
  projectRoot: string,
  options?: {
    agentsDir?: string;
  },
): Promise<AgentLoadResult> {
  const agentsDir = options?.agentsDir ?? join(projectRoot, '.chimera', 'agents');
  return loadAgentsFromDir(agentsDir);
}

/**
 * Find an agent by name from a list of loaded agents.
 */
export function findAgentByName(agents: AgentYaml[], name: string): AgentYaml | undefined {
  return agents.find(a => a.name === name);
}

/**
 * Filter agents by role.
 */
export function filterAgentsByRole(agents: AgentYaml[], role: string): AgentYaml[] {
  return agents.filter(a => a.role === role);
}
