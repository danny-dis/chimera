export interface WorktreeInfo {
    worktreePath: string;
    branch: string;
    headCommit: string;
    gitRoot: string;
}
export declare class WorktreeIsolation {
    private readonly worktreesDir;
    constructor(gitRoot?: string);
    createIsolatedWorktree(agentId: string): Promise<WorktreeInfo>;
    cleanupWorktree(worktree: WorktreeInfo, hasChanges: boolean): Promise<void>;
    hasWorktreeChanges(worktreePath: string, sinceCommit: string): Promise<boolean>;
}
//# sourceMappingURL=worktree-isolation.d.ts.map