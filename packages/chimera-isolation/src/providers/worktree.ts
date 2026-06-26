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

import { access, rm } from 'node:fs/promises';
import { join, normalize, resolve } from 'node:path';
import { createLogger, logEvent } from '@chimera/paths';

import { copyWorktreeFiles } from '../worktree-copy.js';
import {
  classifyIsolationError,
} from '../errors.js';
import { resolveRepoLocalOverride, shortHash, slugify } from './worktree-helpers.js';
import type {
  DestroyOptions,
  DestroyResult,
  IIsolationProvider,
  IsolatedEnvironment,
  IsolationProviderType,
  IsolationRequest,
  RepoConfigLoader,
  WorktreeCreateConfig,
  WorktreeDestroyOptions,
  WorktreeEnvironment,
} from '../types.js';
import {
  toBranchName,
  toWorktreePath,
} from '../types/branded.js';

let cachedLog: ReturnType<typeof createLogger> | undefined;
function getLog() {
  if (!cachedLog) cachedLog = createLogger('isolation.worktree');
  return cachedLog;
}

// ---------------------------------------------------------------------------
// Git subprocess wrapper — promisified execFile with a generous timeout.
// Generous enough for repos with heavy post-checkout hooks (lint/install)
// while still catching genuine hangs (e.g., credential prompts in non-TTY,
// stalled network fetches). Mirrors Archon's `GIT_OPERATION_TIMEOUT_MS`.
// ---------------------------------------------------------------------------

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const GIT_OPERATION_TIMEOUT_MS = 5 * 60 * 1000;

async function git(
  args: string[],
  cwd?: string,
  timeoutMs = GIT_OPERATION_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd, timeout: timeoutMs });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    // Preserve the original error with stderr attached so classifyIsolationError
    // can grep the message.
    const e = err as Error & { stderr?: string; code?: string };
    const wrapped = new Error(e.message) as Error & { stderr?: string; code?: string };
    wrapped.stderr = e.stderr ?? '';
    wrapped.code = e.code;
    throw wrapped;
  }
}

// ---------------------------------------------------------------------------
// WorktreeProvider
// ---------------------------------------------------------------------------

/**
 * Default isolation provider. Git worktrees, one per request.
 *
 * Tests can inject a `RepoConfigLoader` to control how `.archon/config.yaml`
 * is read. In production, the default loader reads from the repo's
 * `.archon/config.yaml`; tests can substitute a mock.
 */
export class WorktreeProvider implements IIsolationProvider {
  readonly providerType: IsolationProviderType = 'worktree';

  constructor(private loadConfig: RepoConfigLoader = defaultLoadConfig) {}

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  /**
   * Create an isolated environment using git worktrees.
   *
   * Config is loaded exactly once here and threaded through the rest of
   * the `create()` call. A malformed `.archon/config.yaml` fails loudly
   * at this boundary rather than being swallowed.
   */
  async create(request: IsolationRequest): Promise<IsolatedEnvironment> {
    let repoConfig: WorktreeCreateConfig | null;
    try {
      repoConfig = await this.loadConfig(request.canonicalRepoPath as unknown as string);
    } catch (error) {
      const err = error as Error;
      throw new Error(`Failed to load repo config: ${err.message}`);
    }

    const branchName = toBranchName(this.generateBranchName(request));
    const worktreePath = this.getWorktreePath(request, branchName, repoConfig);
    // envId is, by contract, the worktree filesystem path (see `destroy()`
    // docstring). Assign directly from the resolved path to keep the
    // invariant in sync with the actual directory created below.
    const envId = worktreePath;

    // Check for existing worktree (adoption)
    const existing = await this.findExisting(request, branchName, worktreePath);
    if (existing) {
      return existing;
    }

    // Create new worktree (re-uses the already-loaded repoConfig — no double load)
    const { warnings } = await this.createWorktree(request, worktreePath, branchName, repoConfig);

    return {
      id: envId,
      provider: 'worktree',
      workingPath: worktreePath,
      branchName,
      status: 'active',
      createdAt: new Date(),
      metadata: { adopted: false, request },
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  // -------------------------------------------------------------------------
  // destroy
  // -------------------------------------------------------------------------

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
  async destroy(envId: string, options?: DestroyOptions): Promise<DestroyResult> {
    const worktreeOptions = options as WorktreeDestroyOptions | undefined;
    const worktreePath = envId;
    const result: DestroyResult = {
      worktreeRemoved: false,
      branchDeleted: null,
      remoteBranchDeleted: null,
      directoryClean: false,
      warnings: [],
    };

    const pathExists = await this.directoryExists(worktreePath);
    if (!pathExists) {
      result.worktreeRemoved = true;
      result.directoryClean = true;
    }

    // Determine repo path: explicit canonicalRepoPath → derive from worktree → bail.
    let repoPath: string;
    if (worktreeOptions?.canonicalRepoPath) {
      repoPath = worktreeOptions.canonicalRepoPath as unknown as string;
    } else if (pathExists) {
      repoPath = await this.getCanonicalRepoPath(worktreePath);
    } else {
      if (worktreeOptions?.branchName) {
        const warning = `Cannot delete branch '${worktreeOptions.branchName}': worktree path gone and no canonicalRepoPath provided`;
        result.warnings.push(warning);
      }
      return result;
    }

    if (pathExists) {
      const gitArgs = ['-C', repoPath, 'worktree', 'remove'];
      if (options?.force) {
        gitArgs.push('--force');
      }
      gitArgs.push(worktreePath);

      try {
        await git(gitArgs);
        result.worktreeRemoved = true;
      } catch (error) {
        if (!this.isWorktreeMissingError(error)) {
          throw error;
        }
        result.worktreeRemoved = true;
      }

      // Ensure directory is fully removed (git may leave untracked files like .archon/)
      const dirExists = await this.directoryExists(worktreePath);
      if (dirExists) {
        try {
          await rm(worktreePath, { recursive: true, force: true });
          result.directoryClean = true;
        } catch (error) {
          const err = error as NodeJS.ErrnoException;
          const warning = `Failed to clean remaining directory at ${worktreePath}: ${err.message}`;
          result.warnings.push(warning);
        }
      } else {
        result.directoryClean = true;
      }
    }

    // Prune stale worktree references — runs even when path is already gone.
    try {
      await git(['-C', repoPath, 'worktree', 'prune'], repoPath, 15000);
    } catch {
      // Best-effort — pruning failure is not critical.
    }

    // Post-removal verification: confirm worktree is actually gone from git.
    if (result.worktreeRemoved) {
      const stillRegistered = await this.isWorktreeRegistered(repoPath, worktreePath);
      if (stillRegistered) {
        result.worktreeRemoved = false;
        result.warnings.push(
          `Worktree at ${worktreePath} was reported removed but is still registered in git`
        );
      }
    }

    // Delete associated branch if provided (best-effort cleanup).
    if (worktreeOptions?.branchName) {
      result.branchDeleted = await this.deleteBranchTracked(
        repoPath,
        worktreeOptions.branchName,
        result
      );

      if (worktreeOptions.deleteRemoteBranch) {
        result.remoteBranchDeleted = await this.deleteRemoteBranchTracked(
          repoPath,
          worktreeOptions.branchName,
          result
        );
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // get
  // -------------------------------------------------------------------------

  async get(envId: string): Promise<IsolatedEnvironment | null> {
    const worktreePath = envId;

    if (!(await this.worktreeExists(toWorktreePath(worktreePath)))) {
      return null;
    }

    let repoPath: string;
    let worktrees: WorktreeInfo[];
    try {
      repoPath = await this.getCanonicalRepoPath(worktreePath);
      worktrees = await this.listWorktrees(repoPath);
    } catch (error) {
      throw error;
    }

    const wt = worktrees.find((w) => w.path === worktreePath);
    if (!wt) {
      // Worktree directory exists but isn't registered in git — corruption.
      return null;
    }

    return {
      id: envId,
      provider: 'worktree',
      workingPath: worktreePath,
      branchName: toBranchName(wt.branch),
      status: 'active',
      createdAt: new Date(), // Cannot determine actual creation time
      metadata: { adopted: false },
    };
  }

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  async list(codebaseId: string): Promise<IsolatedEnvironment[]> {
    const repoPath = codebaseId;
    const worktrees = await this.listWorktrees(repoPath);

    // Filter out main repo (first worktree is typically the main checkout).
    return worktrees
      .filter((wt) => wt.path !== repoPath)
      .map((wt) => ({
        id: wt.path,
        provider: 'worktree' as const,
        workingPath: wt.path,
        branchName: toBranchName(wt.branch),
        status: 'active' as const,
        createdAt: new Date(),
        metadata: { adopted: false },
      }));
  }

  // -------------------------------------------------------------------------
  // adopt
  // -------------------------------------------------------------------------

  /**
   * Adopt an existing worktree.
   * Returns null if the path is not a valid worktree or is unregistered.
   * Throws on permission / I/O errors.
   */
  async adopt(path: string): Promise<IsolatedEnvironment | null> {
    if (!(await this.worktreeExists(toWorktreePath(path)))) {
      return null;
    }

    let repoPath: string;
    let worktrees: WorktreeInfo[];
    try {
      repoPath = await this.getCanonicalRepoPath(path);
      worktrees = await this.listWorktrees(repoPath);
    } catch (error) {
      const err = error as Error;
      if (err.message.toLowerCase().includes('not a git repository')) {
        return null;
      }
      throw error;
    }

    const wt = worktrees.find((w) => w.path === path);
    if (!wt) {
      return null;
    }

    return {
      id: path,
      provider: 'worktree',
      workingPath: path,
      branchName: toBranchName(wt.branch),
      status: 'active',
      createdAt: new Date(),
      metadata: { adopted: true },
    };
  }

  // -------------------------------------------------------------------------
  // healthCheck
  // -------------------------------------------------------------------------

  async healthCheck(envId: string): Promise<boolean> {
    return this.worktreeExists(toWorktreePath(envId));
  }

  // =========================================================================
  // Public helpers (called from create)
  // =========================================================================

  /**
   * Generate semantic branch name. For task workflows: `chimera/task-<slug>`.
   */
  generateBranchName(request: IsolationRequest): string {
    // Today's IsolationRequest union has only the 'task' variant, but the
    // switch is written as a discriminated union so adding 'issue' / 'pr'
    // / 'review' / 'thread' later is non-breaking at the call site.
    switch (request.workflowType) {
      case 'task': {
        const slug = (request.identifier ?? '').toString();
        return `chimera/task-${this.slugify(slug)}`;
      }
      default: {
        // Exhaustiveness check. The cast to `never` is intentional: if a
        // new variant is added to IsolationRequest, TS will fail to compile
        // this line, forcing the author to handle the new case explicitly.
        // The `void` keeps the noUnusedLocals rule happy.
        const _exhaustive = request as never;
        void _exhaustive;
        return `chimera/unknown-${this.shortHash(JSON.stringify(request))}`;
      }
    }
  }

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
  getWorktreePath(
    request: IsolationRequest,
    branchName: string,
    config?: WorktreeCreateConfig | null
  ): string {
    const repoRoot = request.canonicalRepoPath as unknown as string;
    const override = resolveRepoLocalOverride(config?.path, repoRoot);
    if (override !== undefined) {
      return join(repoRoot, override, branchName);
    }
    // Default layout: under the repo's own `.chimera-worktrees/`.
    return join(repoRoot, '.chimera-worktrees', branchName);
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private async findExisting(
    request: IsolationRequest,
    branchName: string,
    worktreePath: string
  ): Promise<WorktreeEnvironment | null> {
    if (await this.worktreeExists(toWorktreePath(worktreePath))) {
      return this.buildAdoptedEnvironment(worktreePath, branchName, request);
    }
    return null;
  }

  private buildAdoptedEnvironment(
    path: string,
    branchName: string,
    request: IsolationRequest
  ): WorktreeEnvironment {
    return {
      id: path,
      provider: 'worktree',
      workingPath: path,
      branchName: toBranchName(branchName),
      status: 'active',
      createdAt: new Date(),
      metadata: { adopted: true, request },
    };
  }

  /**
   * Create the actual worktree. Returns warnings that should be surfaced
   * to the user (non-fatal issues).
   */
  private async createWorktree(
    request: IsolationRequest,
    worktreePath: string,
    branchName: string,
    worktreeConfig: WorktreeCreateConfig | null
  ): Promise<{ warnings: string[] }> {
    const repoPath = request.canonicalRepoPath as unknown as string;
    const baseBranch = worktreeConfig?.baseBranch ?? 'HEAD';

    // Ensure the parent directory exists.
    const worktreeBase = normalize(join(worktreePath, '..'));
    await this.ensureDir(worktreeBase);

    // Determine start-point: explicit fromBranch overrides base branch.
    const startPoint =
      request.workflowType === 'task' && request.fromBranch
        ? (request.fromBranch as unknown as string)
        : baseBranch;

    // Clean up any orphan directory before creating the worktree.
    await this.cleanOrphanDirectoryIfExists(worktreePath);

    try {
      await git([
        '-C',
        repoPath,
        'worktree',
        'add',
        worktreePath,
        '-b',
        branchName,
        startPoint,
      ]);
    } catch (error) {
      const err = error as Error & { stderr?: string };
      if (err.stderr?.includes('already exists')) {
        // Branch exists. If the caller specified an explicit start-point,
        // adopting the existing branch would silently ignore it — throw.
        if (request.workflowType === 'task' && request.fromBranch) {
          throw new Error(
            `Branch "${branchName}" already exists. Cannot create it from "${request.fromBranch}". ` +
              'Either choose a different branch name or omit the start-point override.'
          );
        }
        // Reset the existing branch to the intended start-point and adopt.
        await git(['-C', repoPath, 'branch', '-f', branchName, startPoint]);
        await git(['-C', repoPath, 'worktree', 'add', worktreePath, branchName]);
      } else {
        throw error;
      }
    }

    // Stamp the originating user's git identity on this worktree so workflow
    // commits attribute to the human. Non-fatal on failure.
    if (request.gitIdentity?.email) {
      await this.applyGitIdentity(worktreePath, request.gitIdentity);
    }

    // Initialize submodules unless explicitly opted out.
    if (worktreeConfig?.initSubmodules !== false) {
      await this.initSubmodules(worktreePath);
    }

    // Copy git-ignored files based on repo config.
    const { configLoadFailed } = await this.copyConfiguredFiles(
      repoPath,
      worktreePath,
      worktreeConfig
    );

    const warnings: string[] = [];
    if (configLoadFailed) {
      warnings.push(
        'Config file could not be loaded — copyFiles configuration was not applied. Check your .archon/config.yaml for syntax errors.'
      );
    }
    return { warnings };
  }

  /**
   * Set worktree-local `git config user.email` / `user.name` so commits made
   * in this worktree attribute to the originating user. Non-fatal on failure.
   */
  private async applyGitIdentity(
    worktreePath: string,
    identity: { email: string; name?: string }
  ): Promise<void> {
    try {
      await git(['-C', worktreePath, 'config', 'user.email', identity.email], worktreePath, 5000);
      if (identity.name) {
        await git(['-C', worktreePath, 'config', 'user.name', identity.name], worktreePath, 5000);
      }
    } catch {
      // Non-fatal — worktree without override uses the ambient git identity.
    }
  }

  /**
   * Initialize git submodules in a worktree when the repo uses them.
   *
   * ENOENT on `.gitmodules` → skip (zero-cost for non-submodule repos).
   * Any other error → throw.
   */
  private async initSubmodules(worktreePath: string): Promise<void> {
    try {
      await access(join(worktreePath, '.gitmodules'));
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return;
      }
      throw new Error(
        `Submodule initialization failed: cannot read .gitmodules (${err.code ?? 'unknown error'})`
      );
    }

    try {
      await git(
        ['-C', worktreePath, 'submodule', 'update', '--init', '--recursive'],
        worktreePath,
        120000
      );
    } catch (error) {
      const err = error as Error & { stderr?: string };
      const detail = err.stderr?.trim() || err.message;
      throw new Error(`Submodule initialization failed: ${detail}`);
    }
  }

  /**
   * Copy git-ignored files to worktree based on repo config. Always copies
   * `.archon` by default, plus the user's `copyFiles` list.
   */
  private async copyConfiguredFiles(
    canonicalRepoPath: string,
    worktreePath: string,
    worktreeConfig?: { baseBranch?: string; copyFiles?: string[] } | null
  ): Promise<{ configLoadFailed: boolean }> {
    const defaultCopyFiles = ['.archon'];
    let userCopyFiles: string[] = [];
    let configLoadFailed = false;

    if (worktreeConfig) {
      userCopyFiles = worktreeConfig.copyFiles ?? [];
    } else {
      try {
        const loadedConfig = await this.loadConfig(canonicalRepoPath);
        userCopyFiles = loadedConfig?.copyFiles ?? [];
      } catch {
        configLoadFailed = true;
      }
    }

    const copyFiles = [...new Set([...defaultCopyFiles, ...userCopyFiles])];
    if (copyFiles.length === 0) {
      return { configLoadFailed };
    }

    const result = await copyWorktreeFiles(canonicalRepoPath, worktreePath, copyFiles);
    if (result.copied.length < copyFiles.length) {
      // Some files weren't copied — log a summary line. Detailed per-file
      // errors are already logged inside copyWorktreeFile.
      getLog().warn(
        { copied: result.copied.length, requested: copyFiles.length },
        logEvent('worktree', 'copy', 'partial')
      );
    }
    return { configLoadFailed };
  }

  /**
   * Check if a directory exists. Returns true if it exists, false if ENOENT.
   * Throws for other errors (permission denied, I/O errors, etc.).
   */
  private async directoryExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return false;
      }
      throw new Error(
        `Failed to check directory at ${path}: ${err.message} (code: ${err.code ?? 'unknown'})`
      );
    }
  }

  private async worktreeExists(path: { toString(): string }): Promise<boolean> {
    return this.directoryExists(path.toString());
  }

  /**
   * Resolve a worktree path back to its canonical repo path. Used when
   * the caller didn't pass `canonicalRepoPath` and we need to clean up
   * branches.
   *
   * Implementation: read `.git` (a file for worktrees, a dir for main
   * checkouts) and resolve the `gitdir:` line.
   */
  private async getCanonicalRepoPath(worktreePath: string): Promise<string> {
    const fs = await import('node:fs/promises');
    const { readFile } = fs;
    const path = await import('node:path');
    const { dirname, join: joinPath } = path;

    // Worktree's .git is a file with a single `gitdir: <path>` line.
    const gitFilePath = joinPath(worktreePath, '.git');
    let gitContent: string;
    try {
      gitContent = (await readFile(gitFilePath, 'utf-8')).trim();
    } catch {
      // Not a worktree — assume the path itself is the canonical repo path.
      return worktreePath;
    }
    const match = /^gitdir:\s*(.+)$/m.exec(gitContent);
    if (!match || !match[1]) {
      return worktreePath;
    }
    // The gitdir points at <repo>/.git/worktrees/<name>. Walk up to .git then dirname.
    const gitdir = match[1].trim();
    const dotGit = dirname(gitdir); // .../.git/worktrees → .../.git
    return dirname(dotGit); // .../.git → ...
  }

  /**
   * List all worktrees for a repo. Returns parsed entries with `path`
   * (absolute filesystem path) and `branch` (short branch name, possibly
   * detached).
   */
  private async listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
    const { stdout } = await git(['-C', repoPath, 'worktree', 'list', '--porcelain']);
    const entries: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};
    for (const line of stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) entries.push(current as WorktreeInfo);
        current = { path: line.slice('worktree '.length).trim() };
      } else if (line.startsWith('HEAD ')) {
        current.headCommit = line.slice('HEAD '.length).trim();
      } else if (line.startsWith('branch ')) {
        // "branch refs/heads/main" → strip the refs/heads/ prefix.
        const ref = line.slice('branch '.length).trim();
        current.branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
      }
    }
    if (current.path) entries.push(current as WorktreeInfo);
    return entries;
  }

  /**
   * Check if a worktree is still registered in `git worktree list`.
   */
  private async isWorktreeRegistered(repoPath: string, worktreePath: string): Promise<boolean> {
    try {
      const { stdout } = await git(
        ['-C', repoPath, 'worktree', 'list', '--porcelain'],
        repoPath,
        15000
      );
      const normalizedTarget = resolve(worktreePath);
      return stdout.split('\n').some((line) => {
        if (!line.startsWith('worktree ')) return false;
        const listed = line.slice('worktree '.length).trim();
        return resolve(listed) === normalizedTarget;
      });
    } catch {
      return false;
    }
  }

  /**
   * Detect a "worktree path already gone" error from git. Checks both
   * message and stderr for robustness across git versions/locales.
   */
  private isWorktreeMissingError(error: unknown): boolean {
    const err = error as Error & { stderr?: string };
    const errorText = `${err.message} ${err.stderr ?? ''}`;
    return (
      errorText.includes('No such file or directory') ||
      errorText.includes('does not exist') ||
      errorText.includes('is not a working tree')
    );
  }

  /**
   * Delete a branch and track the result. Never throws — best-effort.
   * Returns true if the branch was deleted or already gone.
   */
  private async deleteBranchTracked(
    repoPath: string,
    branchName: string,
    result: DestroyResult
  ): Promise<boolean> {
    try {
      await git(['-C', repoPath, 'branch', '-D', branchName]);
      return true;
    } catch (error) {
      const err = error as Error & { stderr?: string };
      const errorText = `${err.message} ${err.stderr ?? ''}`;

      if (errorText.includes('not found') || errorText.includes('did not match any')) {
        return true;
      } else if (errorText.includes('checked out at')) {
        result.warnings.push(
          `Cannot delete branch '${branchName}': branch is checked out elsewhere`
        );
        return false;
      } else {
        result.warnings.push(
          `Unexpected error deleting branch '${branchName}': ${err.message}`
        );
        return false;
      }
    }
  }

  /**
   * Delete a remote branch and track the result. Never throws.
   */
  private async deleteRemoteBranchTracked(
    repoPath: string,
    branchName: string,
    result: DestroyResult
  ): Promise<boolean> {
    try {
      await git(['-C', repoPath, 'push', 'origin', '--delete', branchName]);
      return true;
    } catch (error) {
      const err = error as Error & { stderr?: string };
      const errorText = `${err.message} ${err.stderr ?? ''}`;

      if (
        errorText.includes('remote ref does not exist') ||
        errorText.includes("couldn't find remote ref")
      ) {
        return true;
      } else {
        result.warnings.push(
          `Failed to delete remote branch '${branchName}': ${err.message}`
        );
        return false;
      }
    }
  }

  /**
   * Clean up an orphan directory if it exists but is not a valid worktree.
   * Occurs when `git worktree remove` succeeded but left untracked files
   * (like `.archon/`) behind.
   */
  private async cleanOrphanDirectoryIfExists(worktreePath: string): Promise<void> {
    const dirExists = await this.directoryExists(worktreePath);
    if (!dirExists) return;

    const isValidWorktree = await this.worktreeExists(toWorktreePath(worktreePath));
    if (isValidWorktree) return;

    try {
      await rm(worktreePath, { recursive: true, force: true });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      throw new Error(
        `Failed to clean orphan directory at ${worktreePath}: ${err.message}`
      );
    }
  }

  /**
   * Ensure a directory exists (mkdir -p).
   */
  private async ensureDir(dirPath: string): Promise<void> {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dirPath, { recursive: true });
  }

  // Helpers exposed publicly (re-exported from index.ts) — bind `this` so
  // they can be called as methods or as standalone functions.
  private slugify = (input: string): string => slugify(input);
  private shortHash = (input: string): string => shortHash(input);
}

// ---------------------------------------------------------------------------
// WorktreeInfo (internal — used by listWorktrees() and get())
// ---------------------------------------------------------------------------

interface WorktreeInfo {
  path: string;
  /** Short branch name (refs/heads/ prefix stripped). */
  branch: string;
  headCommit: string;
}

// ---------------------------------------------------------------------------
// Default config loader
// ---------------------------------------------------------------------------

/**
 * Default `.archon/config.yaml` loader. Reads the YAML, extracts
 * `worktree:` block, returns null if the file is absent.
 *
 * Uses a minimal hand-rolled YAML parser to avoid pulling in a YAML lib
 * for one config key. Sufficient for the small subset of YAML we need
 * (`worktree: { baseBranch, copyFiles, initSubmodules, path }`). If
 * the user's config has more keys, we ignore them silently.
 *
 * If parsing fails, throws an Error — the WorktreeProvider catches this
 * at the create() boundary and surfaces a warning.
 */
async function defaultLoadConfig(repoPath: string): Promise<WorktreeCreateConfig | null> {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const configPath = join(repoPath, '.archon', 'config.yaml');

  let raw: string;
  try {
    raw = await readFile(configPath, 'utf-8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return null;
    throw new Error(`Failed to read ${configPath}: ${err.message}`);
  }

  return parseWorktreeConfigBlock(raw);
}

/**
 * Minimal hand-rolled YAML parser for the `worktree:` block of
 * `.archon/config.yaml`. Only handles the subset we need.
 *
 * Pattern: top-level key with a mapping value. Indentation matters — we
 * look for the `worktree:` line and any 2-space-indented child.
 *
 *   worktree:
 *     baseBranch: dev
 *     copyFiles:
 *       - .env
 *       - .env.local
 *     initSubmodules: false
 *     path: .worktrees
 */
function parseWorktreeConfigBlock(raw: string): WorktreeCreateConfig {
  const lines = raw.split('\n');
  let inWorktree = false;
  let inCopyFiles = false;
  let baseBranch: string | undefined;
  let copyFiles: string[] | undefined;
  let initSubmodules: boolean | undefined;
  let path: string | undefined;

  for (const line of lines) {
    if (line.startsWith('worktree:')) {
      inWorktree = true;
      inCopyFiles = false;
      continue;
    }
    if (!inWorktree) continue;
    if (line.trim() === '' || line.startsWith('#')) continue;

    // End of the worktree block (next top-level key)
    if (!line.startsWith(' ') && !line.startsWith('\t') && line.includes(':')) {
      inWorktree = false;
      inCopyFiles = false;
      continue;
    }

    if (line.startsWith('  copyFiles:')) {
      inCopyFiles = true;
      copyFiles = copyFiles ?? [];
      continue;
    }
    if (inCopyFiles) {
      const m = /^\s+-\s+(.+)$/.exec(line);
      if (m && m[1]) {
        copyFiles!.push(m[1].trim());
        continue;
      }
      // Empty line or non-list line ends the list
      inCopyFiles = false;
    }

    const m = /^\s+([a-zA-Z]+):\s*(.*)$/.exec(line);
    if (m && m[1]) {
      const key = m[1];
      const value = (m[2] ?? '').trim();
      switch (key) {
        case 'baseBranch':
          baseBranch = value;
          break;
        case 'initSubmodules':
          if (value === 'true') initSubmodules = true;
          else if (value === 'false') initSubmodules = false;
          break;
        case 'path':
          path = value;
          break;
      }
    }
  }

  const result: WorktreeCreateConfig = {};
  if (baseBranch !== undefined) result.baseBranch = baseBranch;
  if (copyFiles !== undefined) result.copyFiles = copyFiles;
  if (initSubmodules !== undefined) result.initSubmodules = initSubmodules;
  if (path !== undefined) result.path = path;
  return result;
}

// Re-export `classifyIsolationError` indirectly so consumers can wire
// their own error handling without re-importing from `errors.js`.
// (Already exported from index.ts.)
export { classifyIsolationError };
