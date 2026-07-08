import { PermissionEngine, PermissionProfile, PermissionDecision } from './policy.js';
/**
 * Policy levels — from broadest (server) to narrowest (session).
 * Stricter rules at narrower levels override broader levels.
 */
export type PolicyLevel = 'server' | 'agent' | 'session';
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
export declare class PolicyStack {
    private policies;
    /**
     * Add a policy at a specific level.
     */
    addPolicy(level: PolicyLevel, profile: PermissionProfile): void;
    /**
     * Remove a policy at a specific level.
     */
    removePolicy(level: PolicyLevel): void;
    /**
     * Check a tool call against all policy levels.
     * Returns the first non-'allow' decision, or 'allow' if all levels permit.
     */
    check(toolName: string, params?: Record<string, unknown>): {
        decision: PermissionDecision;
        level: PolicyLevel | null;
        reason?: string;
    };
    /**
     * Get all active policy levels.
     */
    getActiveLevels(): PolicyLevel[];
    /**
     * Check if a specific level has policies.
     */
    hasLevel(level: PolicyLevel): boolean;
    /**
     * Get the engine for a specific level (for inspection/modification).
     */
    getEngine(level: PolicyLevel): PermissionEngine | undefined;
    /**
     * Clear all policies.
     */
    clear(): void;
}
/**
 * Create a PolicyStack from a config object.
 */
export declare function createPolicyStackFromConfig(config: {
    server?: PermissionProfile;
    agent?: PermissionProfile;
    session?: PermissionProfile;
}): PolicyStack;
//# sourceMappingURL=policy-stack.d.ts.map