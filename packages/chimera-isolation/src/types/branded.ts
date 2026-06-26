/**
 * Branded types — prevent a whole class of "passed a path where a branch
 * name was expected" bugs at zero runtime cost.
 *
 * Pattern (TypeScript nominal typing):
 *   type BranchName = Brand<string, 'BranchName'>;
 *
 * Construction is always via a `to*Name()` helper that does an unchecked
 * cast — the helper is the only place that can produce the brand, so the
 * boundary is auditable.
 *
 * Ported from research/archon/packages/git/src/types.ts @ 2026-06-15.
 */

declare const __brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ---------------------------------------------------------------------------
// Path / name brands
// ---------------------------------------------------------------------------

/** Absolute, resolved filesystem path to a git repository's main checkout. */
export type RepoPath = Brand<string, 'RepoPath'>;

/** Validated git branch name (e.g., 'main', 'chimera-agent-abc12345'). */
export type BranchName = Brand<string, 'BranchName'>;

/** Absolute filesystem path to a git worktree directory. */
export type WorktreePath = Brand<string, 'WorktreePath'>;

// ---------------------------------------------------------------------------
// Construction helpers
// ---------------------------------------------------------------------------
// The ONLY place that can produce a brand. Use these to make brand
// acquisition explicit at the call site.

export function toRepoPath(s: string): RepoPath {
  return s as RepoPath;
}

export function toBranchName(s: string): BranchName {
  return s as BranchName;
}

export function toWorktreePath(s: string): WorktreePath {
  return s as WorktreePath;
}

/** Unwrap a branded path back to a plain string. Use only at the I/O boundary. */
export function unwrap<T extends Brand<string, string>>(b: T): string {
  return b as unknown as string;
}
