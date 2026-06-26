/**
 * WorktreeProvider — git-worktree-based isolation for parallel agent runs.
 *
 * Default isolation strategy for chimera. Each `create(request)` call:
 *   1. Generates a semantic branch name (`chimera/task-<slug>`).
 *   2. Computes a deterministic worktree path under the repo (or a per-repo
 *      override if `worktree.path` is set).
 *   3. Syncs the workspace with the remote base branch (best-effort, non-fatal).
 *   4. Runs `git worktree add` (with stale-branch retry and orphan cleanup).
 *   5. Initializes submodules (if `.gitmodules` exists and `initSubmodules`
 *      is not opted out).
 *   6. Copies configured git-ignored files (`.archon`, plus user config).
 *   7. Stamps the originating user's git identity (if provided).
 *
 * Slimmed port of research/archon/packages/isolation/src/providers/worktree.ts.
 * Dropped from the source: PR-isolation logic, cross-clone ownership guard,
 * fork-PR synthetic branches, and the `archon/*` semantic branch names (replaced with `chimera/*`).
 *
 * Ported from research/archon/packages/isolation/src/providers/worktree.ts
 * @ 2026-06-15.
 */
import { classifyIsolationError } from '../errors.js';
import type { DestroyOptions, DestroyResult, IIsolationProvider, IsolatedEnvironment, IsolationProviderType, IsolationRequest, RepoConfigLoader, WorktreeCreateConfig } from '../types.js';
/**
 * Default isolation provider. Git worktrees, one per request.
 *
 * Tests can inject a `RepoConfigLoader` to control how `.archon/config.yaml`
 * is read. In production, the default loader reads from the repo's
 * `.archon/config.yaml`; tests can substitute a mock.
 */
export declare class WorktreeProvider implements IIsolationProvider {
    private loadConfig;
    readonly providerType: IsolationProviderType;
    constructor(loadConfig?: RepoConfigLoader);
    /**
     * Create an isolated environment using git worktrees.
     *
     * Config is loaded exactly once here and threaded through the rest of
     * the `create()` call. A malformed `.archon/config.yaml` fails loudly
     * at this boundary rather than being swallowed.
     */
    create(request: IsolationRequest): Promise<IsolatedEnvironment>;
    /**
     * Destroy an isolated environment.
     *
     * @param envId - The worktree path (for WorktreeProvider, envId IS the path)
     * @param options - Cleanup options:
     *   - force: Force removal even with uncommitted changes
     *   - branchName: Delete the associated branch after worktree removal
     *   - canonicalRepoPath: Required for branch cleanup if worktree path gone
     *   - deleteRemoteBranch: Best-effort `git push origin --delete <branch>`
     *
     * Cleanup behavior:
     *   - Worktree removal: best-effort, continues if already removed.
     *   - Directory cleanup: best-effort, logs but doesn't fail if persists.
     *   - Branch deletion: best-effort, logs but doesn't fail.
     *   - `git worktree prune` runs after removal to clean stale refs.
     *   - Post-removal verification: confirms the worktree is no longer
     *     registered in git's worktree list.
     *
     * Throws only for unexpected errors (permissions, git failures).
     */
    destroy(envId: string, options?: DestroyOptions): Promise<DestroyResult>;
    get(envId: string): Promise<IsolatedEnvironment | null>;
    list(codebaseId: string): Promise<IsolatedEnvironment[]>;
    /**
     * Adopt an existing worktree.
     * Returns null if the path is not a valid worktree or is unregistered.
     * Throws on permission / I/O errors.
     */
    adopt(path: string): Promise<IsolatedEnvironment | null>;
    healthCheck(envId: string): Promise<boolean>;
    /**
     * Generate semantic branch name. For task workflows: `chimera/task-<slug>`.
     */
    generateBranchName(request: IsolationRequest): string;
    /**
     * Get the worktree path for a request, honoring the per-repo override.
     *
     * Layouts:
     *   - `repo-local`       → `<repoRoot>/<config.path>/<branch>`              (opt-in)
     *   - `workspace-scoped` → `<repoRoot>/.chimera-worktrees/<branch>`         (default)
     *
     * The per-repo `config.path` is validated via `resolveRepoLocalOverride`;
     * unsafe values throw rather than silently falling back.
     */
    getWorktreePath(request: IsolationRequest, branchName: string, config?: WorktreeCreateConfig | null): string;
    private findExisting;
    private buildAdoptedEnvironment;
    /**
     * Create the actual worktree. Returns warnings that should be surfaced
     * to the user (non-fatal issues).
     */
    private createWorktree;
    /**
     * Set worktree-local `git config user.email` / `user.name` so commits made
     * in this worktree attribute to the originating user. Non-fatal on failure.
     */
    private applyGitIdentity;
    /**
     * Initialize git submodules in a worktree when the repo uses them.
     *
     * ENOENT on `.gitmodules` → skip (zero-cost for non-submodule repos).
     * Any other error → throw.
     */
    private initSubmodules;
    /**
     * Copy git-ignored files to worktree based on repo config. Always copies
     * `.archon` by default, plus the user's `copyFiles` list.
     */
    private copyConfiguredFiles;
    /**
     * Check if a directory exists. Returns true if it exists, false if ENOENT.
     * Throws for other errors (permission denied, I/O errors, etc.).
     */
    private directoryExists;
    private worktreeExists;
    /**
     * Resolve a worktree path back to its canonical repo path. Used when
     * the caller didn't pass `canonicalRepoPath` and we need to clean up
     * branches.
     *
     * Implementation: read `.git` (a file for worktrees, a dir for main
     * checkouts) and resolve the `gitdir:` line.
     */
    private getCanonicalRepoPath;
    /**
     * List all worktrees for a repo. Returns parsed entries with `path`
     * (absolute filesystem path) and `branch` (short branch name, possibly
     * detached).
     */
    private listWorktrees;
    /**
     * Check if a worktree is still registered in `git worktree list`.
     */
    private isWorktreeRegistered;
    /**
     * Detect a "worktree path already gone" error from git. Checks both
     * message and stderr for robustness across git versions/locales.
     */
    private isWorktreeMissingError;
    /**
     * Delete a branch and track the result. Never throws — best-effort.
     * Returns true if the branch was deleted or already gone.
     */
    private deleteBranchTracked;
    /**
     * Delete a remote branch and track the result. Never throws.
     */
    private deleteRemoteBranchTracked;
    /**
     * Clean up an orphan directory if it exists but is not a valid worktree.
     * Occurs when `git worktree remove` succeeded but left untracked files
     * (like `.archon/`) behind.
     */
    private cleanOrphanDirectoryIfExists;
    /**
     * Ensure a directory exists (mkdir -p).
     */
    private ensureDir;
    private slugify;
    private shortHash;
}
export { classifyIsolationError };
//# sourceMappingURL=worktree.d.ts.map