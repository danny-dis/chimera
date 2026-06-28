import { PermissionProfile } from './policy.js';
/**
 * Builtin policy factories — ready-to-use policies for common governance patterns.
 * Modeled after Omnigent's builtin policy handlers.
 */
/**
 * Ask before OS tools — requires approval for shell commands and file writes.
 * Default first-run policy.
 */
export declare function askOnOsTools(): PermissionProfile;
/**
 * Read-only policy — no modifications allowed.
 * Useful for review/plan modes.
 */
export declare function readOnlyPolicy(): PermissionProfile;
/**
 * Workspace write policy — allows edits within repo, asks for risky commands.
 * Default for normal coding sessions.
 */
export declare function workspaceWritePolicy(): PermissionProfile;
/**
 * Trusted project policy — allows most operations, denies only dangerous ones.
 * For experienced users with well-tested repos.
 */
export declare function trustedProjectPolicy(): PermissionProfile;
/**
 * Cost budget policy — limits total cost per session.
 * Returns 'deny' when budget exceeded, 'ask' at warning thresholds.
 */
export declare function costBudgetPolicy(options: {
    maxCostUsd: number;
    askThresholdsUsd?: number[];
}): PermissionProfile;
/**
 * Max tool calls policy — limits total tool calls per session.
 */
export declare function maxToolCallsPolicy(limit: number): PermissionProfile;
/**
 * Destructive commands policy — blocks all destructive operations.
 */
export declare function destructiveCommandsPolicy(): PermissionProfile;
/**
 * Network policy — controls network access.
 */
export declare function networkPolicy(options?: {
    allowNetwork?: boolean;
    allowedDomains?: string[];
}): PermissionProfile;
/**
 * Get all builtin policy names.
 */
export declare function getBuiltinPolicyNames(): string[];
/**
 * Create a builtin policy by name.
 */
export declare function createBuiltinPolicy(name: string, options?: Record<string, unknown>): PermissionProfile | undefined;
//# sourceMappingURL=builtins.d.ts.map