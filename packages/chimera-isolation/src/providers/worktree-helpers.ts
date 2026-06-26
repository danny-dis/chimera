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

import { createHash } from 'node:crypto';
import { isAbsolute, normalize, resolve, sep } from 'node:path';

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

/**
 * Slugify a string for use in a git branch name.
 * Lowercase, non-alphanumerics collapsed to `-`, leading/trailing hyphens
 * stripped, length capped at 50 chars to keep branch names short.
 *
 * Example: `'Implement Foo! Bar?'` → `'implement-foo-bar'`
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

// ---------------------------------------------------------------------------
// shortHash
// ---------------------------------------------------------------------------

/**
 * Stable 8-hex-char sha256 prefix. Used for thread identifiers (Slack /
 * Discord) that need to be short but low-collision.
 *
 * Example: `'slack:C0123:1700000000.000'` → `'a1b2c3d4'`
 */
export function shortHash(input: string): string {
  const hash = createHash('sha256').update(input).digest('hex');
  return hash.substring(0, 8);
}

// ---------------------------------------------------------------------------
// resolveRepoLocalOverride
// ---------------------------------------------------------------------------

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
export function resolveRepoLocalOverride(
  rawPath: string | undefined,
  repoRoot: string
): string | undefined {
  if (rawPath === undefined) return undefined;
  const trimmed = rawPath.trim();
  if (!trimmed) return undefined;

  if (isAbsolute(trimmed)) {
    throw new Error(
      `.archon/config.yaml worktree.path must be relative to the repo root (got absolute: ${trimmed}). ` +
        'For an absolute location, set ~/.archon/config.yaml paths.worktrees instead.'
    );
  }

  const normalized = normalize(trimmed);
  // A plain `..` or anything that starts with `../` or contains `/../` escapes the repo.
  if (
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('..\\') ||
    normalized.includes('/../') ||
    normalized.includes('\\..\\')
  ) {
    throw new Error(
      `.archon/config.yaml worktree.path must stay within the repo (got: ${trimmed}). ` +
        'Remove any `..` segments.'
    );
  }

  // Double-check via resolved absolute paths — catches edge cases like a path
  // that normalizes clean but still escapes when joined (e.g. leading `./../`
  // on some platforms). Uses `path.sep` so the "is inside repoRoot" check
  // works on Windows (\\) as well as POSIX (/).
  const resolved = resolve(repoRoot, normalized);
  const repoRootResolved = resolve(repoRoot);
  if (resolved !== repoRootResolved && !resolved.startsWith(repoRootResolved + sep)) {
    throw new Error(
      `.archon/config.yaml worktree.path resolves outside the repo root (got: ${trimmed} → ${resolved}).`
    );
  }

  return normalized;
}
