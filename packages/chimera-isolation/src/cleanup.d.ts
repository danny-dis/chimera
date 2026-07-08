/**
 * Scan a worktree directory for stale worktrees older than maxAgeMs.
 * Returns a list of stale worktree paths without deleting them.
 */
export declare function cleanupStaleWorktrees(worktreeDir: string, maxAgeMs: number): Promise<string[]>;
/**
 * Remove a git worktree at the given path.
 * Uses `git worktree remove` which handles locked worktrees gracefully.
 */
export declare function removeWorktree(path: string): Promise<void>;
//# sourceMappingURL=cleanup.d.ts.map