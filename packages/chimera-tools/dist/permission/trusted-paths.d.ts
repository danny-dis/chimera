import type { PermissionProfile } from './policy.js';
/** Load the persisted set of trusted roots for a workspace. */
export declare function loadTrustedPaths(workspaceRoot: string): Set<string>;
/** Persist a trusted root (creates the .chimera dir if needed). */
export declare function addTrustedPath(workspaceRoot: string, dir: string): void;
/** True if `target` is inside any trusted root. */
export declare function isTrusted(workspaceRoot: string, target: string): boolean;
/**
 * Permission profile for a workspace: when the root is trusted, the
 * relaxed `trustedProjectPolicy` applies (allows everything except a short
 * dangerous-command blocklist); otherwise the caller should fall back to a
 * stricter profile.
 */
export declare function getProfileForWorkspace(workspaceRoot: string): PermissionProfile;
//# sourceMappingURL=trusted-paths.d.ts.map