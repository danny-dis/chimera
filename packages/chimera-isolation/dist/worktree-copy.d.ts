/**
 * Worktree file copy utility
 *
 * Copies git-ignored files from the canonical repo to a new worktree
 * based on configuration in `.archon/config.yaml` (or chimera's own
 * user-facing config — see TODO in errors.ts).
 *
 * Ported from research/archon/packages/isolation/src/worktree-copy.ts @ 2026-06-15.
 */
import type { CopyFileEntry, CopyWorktreeFilesResult } from './worktree-copy-types.js';
export type { CopyFileEntry, CopyWorktreeFilesResult } from './worktree-copy-types.js';
/**
 * Parse a copy file entry from config.
 * Each entry is a path to a git-ignored file or directory to copy into worktrees.
 *
 * @param entry - Config entry like ".env" or "data/fixtures/"
 * @returns Parsed source and destination (always identical)
 * @throws Error if entry is empty
 */
export declare function parseCopyFileEntry(entry: string): CopyFileEntry;
/**
 * Check if a path escapes its root directory (path traversal attack).
 * Works on both Unix and Windows paths.
 *
 * @param root - The root directory path
 * @param filePath - The relative file path to check
 * @returns true if path stays within root, false if it escapes
 */
export declare function isPathWithinRoot(root: string, filePath: string): boolean;
/**
 * Copy a single file or directory from source repo to worktree.
 *
 * @param sourceRoot - Canonical repo path
 * @param destRoot - Worktree path
 * @param entry - Parsed copy file entry
 * @returns true if copied successfully, false if:
 *   - Source doesn't exist (ENOENT) - expected, silently skipped
 *   - Path traversal detected - security violation, logged as error
 *   - Other errors (permissions, disk full, etc.) - logged as error
 */
export declare function copyWorktreeFile(sourceRoot: string, destRoot: string, entry: CopyFileEntry): Promise<boolean>;
/**
 * Copy all configured files from canonical repo to worktree.
 *
 * @param canonicalRepoPath - Path to the main repository
 * @param worktreePath - Path to the new worktree
 * @param copyFiles - Array of file paths from config
 * @returns Result with successfully copied entries and per-entry status
 */
export declare function copyWorktreeFiles(canonicalRepoPath: string, worktreePath: string, copyFiles: string[]): Promise<CopyWorktreeFilesResult>;
//# sourceMappingURL=worktree-copy.d.ts.map