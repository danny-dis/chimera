/**
 * Worktree helpers — small pure functions extracted from WorktreeProvider
 * to keep the provider file under 1,000 LOC and to make these utilities
 * individually testable.
 *
 *   - `slugify(input)`           → kebab-case, max 50 chars, safe for branch names.
 *   - `shortHash(input)`         → 8-hex-char sha256 prefix; stable, low-collision.
 *   - `resolveRepoLocalOverride(rawPath, repoRoot)` → defensive path validation
 *                                  for the per-repo `worktree.path` config.
 *
 * Ported from research/archon/packages/isolation/src/providers/worktree.ts
 * (lines 71-113, 1244-1258) @ 2026-06-15.
 */
/**
 * Slugify a string for use in a git branch name.
 * Lowercase, non-alphanumerics collapsed to `-`, leading/trailing hyphens
 * stripped, length capped at 50 chars to keep branch names short.
 *
 * Example: `'Implement Foo! Bar?'` → `'implement-foo-bar'`
 */
export declare function slugify(input: string): string;
/**
 * Stable 8-hex-char sha256 prefix. Used for thread identifiers (Slack /
 * Discord) that need to be short but low-collision.
 *
 * Example: `'slack:C0123:1700000000.000'` → `'a1b2c3d4'`
 */
export declare function shortHash(input: string): string;
/**
 * Validate a user-supplied `worktree.path` from `.archon/config.yaml` and
 * return it as a safe relative path for the worktree base computation,
 * or `undefined` to fall through to default path resolution.
 *
 * Rules (Fail Fast — malformed values throw; empty/whitespace values are
 * ignored):
 *   - `undefined` / empty-after-trim → `undefined` (no override).
 *   - Absolute path                  → throw (users must configure globally).
 *   - Contains `..` segment          → throw (escapes repo root).
 *   - Resolved path escapes repoRoot → throw (catches symlink / nested `../`
 *                                      edge cases that normalize clean).
 *
 * The path is returned trimmed. The caller composes it via `join(repoRoot, result)`.
 */
export declare function resolveRepoLocalOverride(rawPath: string | undefined, repoRoot: string): string | undefined;
//# sourceMappingURL=worktree-helpers.d.ts.map