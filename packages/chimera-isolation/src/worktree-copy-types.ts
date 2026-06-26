/**
 * Types for the worktree-copy utility. Kept separate from worktree-copy.ts
 * to avoid the circular import when consumers (e.g. WorktreeProvider) only
 * need the types.
 */

export interface CopyFileEntry {
  source: string;
  destination: string;
}

/**
 * Result of a copyWorktreeFiles batch call.
 * - `copied`  — files successfully copied.
 * - `skipped` — files not copied due to ENOENT, EACCES, or path traversal.
 *               Non-fatal; worktree creation is still successful.
 * - `failed`  — reserved for future use; currently always empty.
 */
export interface CopyWorktreeFilesResult {
  copied: CopyFileEntry[];
  skipped: CopyFileEntry[];
  failed: CopyFileEntry[];
}
