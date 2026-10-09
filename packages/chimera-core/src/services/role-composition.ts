// =============================================================================
// Role Composition — defines role contracts and composition logic.
// 
// Each role has a contract: tools it can use, capabilities it needs,
// and how it composes with other roles in multi-agent strategies.
// =============================================================================

import type { AgentRole } from '@chimera/domain';

/**
 * Role contract — defines what a role can do and needs.
 */
export interface RoleContract {
  role: AgentRole;
  description: string;
  /** Tools this role can access (by permission level) */
  permissionLevels: Array<'read' | 'write' | 'execute'>;
  /** Capabilities this role requires from the model */
  requiredCapabilities: string[];
  /** Whether this role can be collapsed into another (for single-model UX) */
  collapsibleInto?: AgentRole[];
  /** Whether this role requires a separate model instance */
  requiresIsolation: boolean;
}

/**
 * Role composition — defines how roles combine in a strategy.
 */
export interface RoleComposition {
  id: string;
  description: string;
  roles: AgentRole[];
  /** Whether roles execute sequentially or in parallel */
  execution: 'sequential' | 'parallel' | 'panel';
  /** Whether this composition can collapse to fewer roles for single-model UX */
  collapsible: boolean;
  /** Minimum number of distinct models needed */
  minModels: number;
}

/**
 * Built-in role contracts.
 */
export const ROLE_CONTRACTS: Record<AgentRole, RoleContract> = {
  planner: {
    role: 'planner',
    description: 'Analyzes tasks and creates execution plans',
    permissionLevels: ['read'],
    requiredCapabilities: ['structuredOutput'],
    collapsibleInto: ['implementer'],
    requiresIsolation: false,
  },
  explorer: {
    role: 'explorer',
    description: 'Investigates codebase and gathers context',
    permissionLevels: ['read'],
    requiredCapabilities: [],
    collapsibleInto: ['planner', 'implementer'],
    requiresIsolation: false,
  },
  implementer: {
    role: 'implementer',
    description: 'Writes and edits code',
    permissionLevels: ['read', 'write', 'execute'],
    requiredCapabilities: ['toolCalling'],
    collapsibleInto: [],
    requiresIsolation: true,
  },
  debugger: {
    role: 'debugger',
    description: 'Diagnoses and fixes bugs',
    permissionLevels: ['read', 'write', 'execute'],
    requiredCapabilities: ['toolCalling', 'reasoning'],
    collapsibleInto: ['implementer'],
    requiresIsolation: true,
  },
  tester: {
    role: 'tester',
    description: 'Runs tests and validates behavior',
    permissionLevels: ['read', 'write', 'execute'],
    requiredCapabilities: ['toolCalling'],
    collapsibleInto: ['debugger'],
    requiresIsolation: true,
  },
  reviewer: {
    role: 'reviewer',
    description: 'Reviews output for correctness and quality',
    permissionLevels: ['read'],
    requiredCapabilities: ['structuredOutput'],
    collapsibleInto: ['implementer'],
    requiresIsolation: false,
  },
  'security-reviewer': {
    role: 'security-reviewer',
    description: 'Reviews output for security vulnerabilities',
    permissionLevels: ['read'],
    requiredCapabilities: ['structuredOutput', 'reasoning'],
    collapsibleInto: ['reviewer'],
    requiresIsolation: false,
  },
  synthesizer: {
    role: 'synthesizer',
    description: 'Combines multiple outputs into a unified result',
    permissionLevels: ['read'],
    requiredCapabilities: ['structuredOutput'],
    collapsibleInto: ['reviewer'],
    requiresIsolation: false,
  },
  researcher: {
    role: 'researcher',
    description: 'Researches topics and gathers information',
    permissionLevels: ['read'],
    requiredCapabilities: [],
    collapsibleInto: ['planner', 'explorer'],
    requiresIsolation: false,
  },
  summarizer: {
    role: 'summarizer',
    description: 'Summarizes information and results',
    permissionLevels: ['read'],
    requiredCapabilities: [],
    collapsibleInto: ['synthesizer'],
    requiresIsolation: false,
  },
};

/**
 * Built-in role compositions (strategies).
 */
export const ROLE_COMPOSITIONS: Record<string, RoleComposition> = {
  solo: {
    id: 'solo',
    description: 'Single implementer, no verification',
    roles: ['implementer'],
    execution: 'sequential',
    collapsible: true,
    minModels: 1,
  },
  duo: {
    id: 'duo',
    description: 'Implementer + reviewer',
    roles: ['implementer', 'reviewer'],
    execution: 'sequential',
    collapsible: true,
    minModels: 1,
  },
  trio: {
    id: 'trio',
    description: 'Implementer + reviewer + security-reviewer',
    roles: ['implementer', 'reviewer', 'security-reviewer'],
    execution: 'sequential',
    collapsible: true,
    minModels: 1,
  },
  fusion: {
    id: 'fusion',
    description: 'Panel of reviewers + synthesizer',
    roles: ['implementer', 'reviewer', 'security-reviewer', 'synthesizer'],
    execution: 'panel',
    collapsible: true,
    minModels: 2,
  },
  hive: {
    id: 'hive',
    description: 'Planner + parallel implementers + synthesizer',
    roles: ['planner', 'implementer', 'synthesizer'],
    execution: 'parallel',
    collapsible: false,
    minModels: 3,
  },
  swarm: {
    id: 'swarm',
    description: 'Many implementers + voting',
    roles: ['implementer', 'synthesizer'],
    execution: 'parallel',
    collapsible: false,
    minModels: 2,
  },
};

/**
 * RoleComposer — determines optimal role composition for a task.
 */
export class RoleComposer {
  /**
   * Get the role composition for a strategy.
   */
  getComposition(strategy: string): RoleComposition | undefined {
    return ROLE_COMPOSITIONS[strategy];
  }

  /**
   * Get the contract for a role.
   */
  getContract(role: AgentRole): RoleContract | undefined {
    return ROLE_CONTRACTS[role];
  }

  /**
   * Determine if a composition can collapse to fewer roles for single-model UX.
   */
  canCollapse(strategy: string): boolean {
    const composition = this.getComposition(strategy);
    return composition?.collapsible ?? false;
  }

  /**
   * Collapse a composition to the minimum viable set of roles.
   * Used for single-model UX where one model plays multiple roles.
   */
  collapse(strategy: string): AgentRole[] {
    const composition = this.getComposition(strategy);
    if (!composition) return ['implementer'];

    // Solo stays solo
    if (strategy === 'solo') return ['implementer'];

    // Duo collapses to implementer (reviewer is optional for single-model)
    if (strategy === 'duo') return ['implementer'];

    // Trio collapses to implementer + reviewer (security-reviewer merges into reviewer)
    if (strategy === 'trio') return ['implementer', 'reviewer'];

    // Fusion collapses to implementer + reviewer (panel becomes single reviewer)
    if (strategy === 'fusion') return ['implementer', 'reviewer'];

    // Hive and swarm don't collapse (they need parallelism)
    return composition.roles;
  }

  /**
   * Get the permission levels needed for a role.
   */
  getPermissionLevels(role: AgentRole): Array<'read' | 'write' | 'execute'> {
    return this.getContract(role)?.permissionLevels ?? ['read'];
  }

  /**
   * Get the required capabilities for a role.
   */
  getRequiredCapabilities(role: AgentRole): string[] {
    return this.getContract(role)?.requiredCapabilities ?? [];
  }

  /**
   * Check if a model's capabilities satisfy a role's requirements.
   */
  canModelFulfillRole(
    role: AgentRole,
    modelCapabilities: {
      toolCalling?: boolean;
      structuredOutput?: boolean;
      reasoning?: boolean;
    },
  ): boolean {
    const required = this.getRequiredCapabilities(role);
    for (const cap of required) {
      if (cap === 'toolCalling' && !modelCapabilities.toolCalling) return false;
      if (cap === 'structuredOutput' && !modelCapabilities.structuredOutput) return false;
      if (cap === 'reasoning' && !modelCapabilities.reasoning) return false;
    }
    return true;
  }

  /**
   * Get all available strategies.
   */
  getAvailableStrategies(): string[] {
    return Object.keys(ROLE_COMPOSITIONS);
  }

  /**
   * Get roles for a strategy, optionally collapsed.
   */
  getRolesForStrategy(strategy: string, collapsed = false): AgentRole[] {
    if (collapsed) {
      return this.collapse(strategy);
    }
    return this.getComposition(strategy)?.roles ?? ['implementer'];
  }
}
