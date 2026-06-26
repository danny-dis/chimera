/**
 * Isolation Provider Abstraction Types
 *
 * Platform-agnostic interfaces for workflow isolation mechanisms.
 * Git worktrees are the default implementation, but the abstraction
 * enables future strategies (containers, VMs, remote).
 *
 * This is a slimmed port of research/archon/packages/isolation/src/types.ts.
 * Archon's full type surface has been narrowed to chimera's actual needs:
 *   - kept: 'task' IsolationRequest variant
 *   - dropped: 'issue' | 'pr' | 'review' | 'thread' (no multi-source intake)
 *   - dropped: PR-specific IsolationHints fields
 *   - dropped: ResolveRequest / IsolationResolver (premature)
 *
 * The single source of truth for the `IIsolationProvider` contract lives here.
 * Ported from research/archon/packages/isolation/src/types.ts @ 2026-06-15.
 */

import type { BranchName, RepoPath } from './types/branded.js';

// ---------------------------------------------------------------------------
// Provider / workflow / environment enums
// ---------------------------------------------------------------------------

export type IsolationProviderType = 'worktree' | 'container' | 'vm' | 'remote';

/** Chimera-slim: only 'task' for now. */
export type IsolationWorkflowType = 'task';

export type EnvironmentStatus = 'active' | 'destroyed';

// ---------------------------------------------------------------------------
// Isolation Request (discriminated union)
// ---------------------------------------------------------------------------

interface IsolationRequestBase {
  /** Human-readable codebase name (e.g., 'owner/repo'). Optional — purely informational. */
  codebaseName?: string;

  /**
   * Absolute, resolved filesystem path to the main repository checkout.
   *
   * "Canonical" means the real path with symlinks resolved and `~` expanded.
   * This must point to the primary git checkout, not a worktree, because
   * git worktree operations (add, remove, list) must be executed from the
   * main repo.
   */
  canonicalRepoPath: RepoPath;

  description?: string;

  /**
   * Optional git author identity to stamp on the new worktree
   * (`git config user.email` / `user.name`). Absent → ambient git identity.
   */
  gitIdentity?: { email: string; name?: string };
}

/**
 * Chimera's only isolation request variant today. When multi-source intake
 * (issue / PR / thread) is added later, this becomes a discriminated union
 * over `workflowType`.
 */
export interface TaskIsolationRequest extends IsolationRequestBase {
  workflowType: 'task';
  /** Task identifier — slugified for branch name, max 50 chars. */
  identifier: string;
  /** Optional branch to use as the start-point for new task branch creation. */
  fromBranch?: BranchName;
}

export type IsolationRequest = TaskIsolationRequest;

// ---------------------------------------------------------------------------
// Isolated Environment
// ---------------------------------------------------------------------------

export interface AdoptedWorktreeMetadata {
  adopted: true;
  adoptedFrom?: 'path' | 'branch';
  request?: IsolationRequest;
}

export interface CreatedWorktreeMetadata {
  adopted: false;
  request?: IsolationRequest;
}

export type WorktreeMetadata = AdoptedWorktreeMetadata | CreatedWorktreeMetadata;

interface IsolatedEnvironmentBase {
  /** For worktrees, this is the filesystem path. */
  id: string;
  workingPath: string;
  status: EnvironmentStatus;
  /**
   * For worktrees, set to the current time since git doesn't store
   * creation timestamps. For accurate timestamps, persist in the database.
   */
  createdAt: Date;
  /** Non-fatal warnings to surface to the user after successful creation. */
  warnings?: string[];
}

export interface WorktreeEnvironment extends IsolatedEnvironmentBase {
  provider: 'worktree';
  branchName: BranchName;
  metadata: WorktreeMetadata;
}

export type IsolatedEnvironment = WorktreeEnvironment;

// ---------------------------------------------------------------------------
// Provider Interface
// ---------------------------------------------------------------------------

export interface DestroyOptions {
  force?: boolean;
}

export interface WorktreeDestroyOptions extends DestroyOptions {
  branchName?: BranchName;
  /**
   * Required for branch cleanup if the worktree path no longer exists.
   * Caller is responsible for providing this when destroying environments
   * whose worktree may already have been removed externally.
   */
  canonicalRepoPath?: RepoPath;
  /**
   * Delete the remote branch (best-effort, e.g., after PR merge).
   * Only meaningful for `worktree` provider.
   */
  deleteRemoteBranch?: boolean;
}

/**
 * Communicates partial failures from best-effort cleanup operations.
 * All fields reflect what actually happened during destruction.
 */
export interface DestroyResult {
  worktreeRemoved: boolean;
  /** null = no branch specified. */
  branchDeleted: boolean | null;
  /** null = not requested. */
  remoteBranchDeleted: boolean | null;
  directoryClean: boolean;
  warnings: string[];
}

/**
 * Provider interface for isolation strategies.
 *
 * Manages the lifecycle of isolated development environments:
 * `create` → `use` → `destroy`. Git worktrees are the default (and currently
 * only) implementation.
 *
 * Error contract:
 *   - `create`    throws on failure (caller surfaces to user).
 *   - `destroy`   returns a `DestroyResult` with partial-failure details.
 *   - `get`       returns null if not found; throws on unexpected I/O errors.
 *   - `healthCheck` returns false if missing; throws on permission errors.
 */
export interface IIsolationProvider {
  readonly providerType: IsolationProviderType;

  create(request: IsolationRequest): Promise<IsolatedEnvironment>;

  /**
   * Best-effort cleanup. Throws only for unexpected errors
   * (permissions, git failures).
   */
  destroy(
    envId: string,
    options?: DestroyOptions | WorktreeDestroyOptions
  ): Promise<DestroyResult>;

  get(envId: string): Promise<IsolatedEnvironment | null>;

  /** For worktrees, codebaseId is the canonical repo path. */
  list(codebaseId: string): Promise<IsolatedEnvironment[]>;

  /** Take ownership of externally-created environments (optional). */
  adopt?(path: string): Promise<IsolatedEnvironment | null>;

  healthCheck(envId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Isolation Hints (currently a no-op stub for forward-compat)
// ---------------------------------------------------------------------------

/**
 * Chimera-slim: this exists only as a placeholder for future hint-based
 * routing. Today there is no resolver consumer; see
 * research/archon/packages/isolation/src/resolver.ts for the full pattern.
 */
export interface IsolationHints {
  workflowType?: IsolationWorkflowType;
  workflowId?: string;
  /** Start-point branch for new task worktree creation. */
  fromBranch?: BranchName;
  /** Expected base branch for this workflow. */
  baseBranch?: BranchName;
}

export type IsolationBlockReason = 'creation_failed';

// ---------------------------------------------------------------------------
// Config Injection
// ---------------------------------------------------------------------------

/**
 * Per-project worktree creation config — sourced from `.archon/config.yaml`
 * or chimera's equivalent. All fields are optional; missing values fall back
 * to safe defaults (worktree base branch auto-detected, no file copy).
 */
export interface WorktreeCreateConfig {
  /** Base branch to use as the start-point. Auto-detected when omitted. */
  baseBranch?: string;
  /**
   * Git-ignored files to copy from the main checkout to each new worktree.
   * Common entries: '.env', '.env.local', '.vscode'. Default: `['.archon']`.
   */
  copyFiles?: string[];
  /**
   * Initialize git submodules in the worktree. Defaults to enabled — a
   * worktree with uninitialized submodules is a silent broken state for
   * monorepos. No-op when `.gitmodules` is absent.
   * @default true
   */
  initSubmodules?: boolean;
  /**
   * Per-project relative path (from repo root) where worktrees should be
   * created. When set, worktrees live at `<repoRoot>/<path>/<branch>`.
   * Must be a safe relative path: no leading `/`, no `..` segments.
   * Validation is enforced in `WorktreeProvider.getWorktreePath()` (fails
   * fast with a clear error rather than silently falling back).
   * @example '.worktrees'
   */
  path?: string;
}

/** Loader for the per-repo worktree config. Returns null if not configured. */
export type RepoConfigLoader = (repoPath: string) => Promise<WorktreeCreateConfig | null>;
