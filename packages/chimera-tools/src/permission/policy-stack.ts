import { PermissionEngine, PermissionProfile, PermissionDecision } from './policy.js';

/**
 * Policy levels — from broadest (server) to narrowest (session).
 * Stricter rules at narrower levels override broader levels.
 */
export type PolicyLevel = 'server' | 'agent' | 'session';

/**
 * A policy entry with its level and priority.
 */
interface PolicyEntry {
  level: PolicyLevel;
  engine: PermissionEngine;
  priority: number;
}

/**
 * Policy priority — lower number = higher priority (checked first).
 * Session > Agent > Server
 */
const LEVEL_PRIORITY: Record<PolicyLevel, number> = {
  session: 0,
  agent: 1,
  server: 2,
};

/**
 * PolicyStack — Three-level policy governance.
 *
 * Policies stack across three levels:
 * - **server-wide** (admin): Base policies for all agents
 * - **per-agent** (developer): Agent-specific overrides
 * - **per-session** (user): Session-specific overrides
 *
 * Stricter rules at narrower levels override broader levels.
 *
 * Modeled after Omnigent's policy stacking pattern.
 */
export class PolicyStack {
  private policies: PolicyEntry[] = [];

  /**
   * Add a policy at a specific level.
   */
  addPolicy(level: PolicyLevel, profile: PermissionProfile): void {
    const engine = new PermissionEngine(profile);
    const existingIndex = this.policies.findIndex(p => p.level === level);

    const entry: PolicyEntry = {
      level,
      engine,
      priority: LEVEL_PRIORITY[level],
    };

    if (existingIndex >= 0) {
      this.policies[existingIndex] = entry;
    } else {
      this.policies.push(entry);
    }

    // Sort by priority (lower number = higher priority)
    this.policies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Remove a policy at a specific level.
   */
  removePolicy(level: PolicyLevel): void {
    this.policies = this.policies.filter(p => p.level !== level);
  }

  /**
   * Check a tool call against all policy levels.
   * Returns the first non-'allow' decision, or 'allow' if all levels permit.
   */
  check(toolName: string, params: Record<string, unknown> = {}): {
    decision: PermissionDecision;
    level: PolicyLevel | null;
    reason?: string;
  } {
    for (const entry of this.policies) {
      const decision = entry.engine.check(toolName, params);
      if (decision !== 'allow') {
        return {
          decision,
          level: entry.level,
          reason: `Denied by ${entry.level} policy`,
        };
      }
    }

    return {
      decision: 'allow',
      level: null,
    };
  }

  /**
   * Get all active policy levels.
   */
  getActiveLevels(): PolicyLevel[] {
    return this.policies.map(p => p.level);
  }

  /**
   * Check if a specific level has policies.
   */
  hasLevel(level: PolicyLevel): boolean {
    return this.policies.some(p => p.level === level);
  }

  /**
   * Get the engine for a specific level (for inspection/modification).
   */
  getEngine(level: PolicyLevel): PermissionEngine | undefined {
    return this.policies.find(p => p.level === level)?.engine;
  }

  /**
   * Clear all policies.
   */
  clear(): void {
    this.policies = [];
  }
}

/**
 * Create a PolicyStack from a config object.
 */
export function createPolicyStackFromConfig(config: {
  server?: PermissionProfile;
  agent?: PermissionProfile;
  session?: PermissionProfile;
}): PolicyStack {
  const stack = new PolicyStack();

  if (config.server) {
    stack.addPolicy('server', config.server);
  }
  if (config.agent) {
    stack.addPolicy('agent', config.agent);
  }
  if (config.session) {
    stack.addPolicy('session', config.session);
  }

  return stack;
}
