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
export type Brand<T, B extends string> = T & {
    readonly [__brand]: B;
};
/** Absolute, resolved filesystem path to a git repository's main checkout. */
export type RepoPath = Brand<string, 'RepoPath'>;
/** Validated git branch name (e.g., 'main', 'chimera-agent-abc12345'). */
export type BranchName = Brand<string, 'BranchName'>;
/** Absolute filesystem path to a git worktree directory. */
export type WorktreePath = Brand<string, 'WorktreePath'>;
export declare function toRepoPath(s: string): RepoPath;
export declare function toBranchName(s: string): BranchName;
export declare function toWorktreePath(s: string): WorktreePath;
/** Unwrap a branded path back to a plain string. Use only at the I/O boundary. */
export declare function unwrap<T extends Brand<string, string>>(b: T): string;
export {};
//# sourceMappingURL=branded.d.ts.map