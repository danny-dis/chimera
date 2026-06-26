/**
 * Worktree file copy utility
 *
 * Copies git-ignored files from the canonical repo to a new worktree
 * based on configuration in `.archon/config.yaml` (or chimera's own
 * user-facing config — see TODO in errors.ts).
 *
 * Ported from research/archon/packages/isolation/src/worktree-copy.ts @ 2026-06-15.
 */

import { copyFile, cp, stat, mkdir } from 'node:fs/promises';
import { join, dirname, relative, isAbsolute, normalize } from 'node:path';
import { createLogger, logEvent } from '@chimera/paths';

import type { CopyFileEntry, CopyWorktreeFilesResult } from './worktree-copy-types.js';

export type { CopyFileEntry, CopyWorktreeFilesResult } from './worktree-copy-types.js';

const log = createLogger('isolation.worktree-copy');

/**
 * Parse a copy file entry from config.
 * Each entry is a path to a git-ignored file or directory to copy into worktrees.
 *
 * @param entry - Config entry like ".env" or "data/fixtures/"
 * @returns Parsed source and destination (always identical)
 * @throws Error if entry is empty
 */
export function parseCopyFileEntry(entry: string): CopyFileEntry {
  const trimmed = entry.trim();

  if (!trimmed) {
    throw new Error('Copy entry cannot be empty');
  }

  return { source: trimmed, destination: trimmed };
}

/**
 * Check if a path escapes its root directory (path traversal attack).
 * Works on both Unix and Windows paths.
 *
 * @param root - The root directory path
 * @param filePath - The relative file path to check
 * @returns true if path stays within root, false if it escapes
 */
export function isPathWithinRoot(root: string, filePath: string): boolean {
  const fullPath = normalize(join(root, filePath));
  const normalizedRoot = normalize(root);

  const relativePath = relative(normalizedRoot, fullPath);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return false;
  }

  return true;
}

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
export async function copyWorktreeFile(
  sourceRoot: string,
  destRoot: string,
  entry: CopyFileEntry
): Promise<boolean> {
  if (!isPathWithinRoot(sourceRoot, entry.source)) {
    log.error(
      {
        source: entry.source,
        sourceRoot,
        reason: 'Source path escapes repository root',
      },
      logEvent('worktree-copy', 'path-traversal', 'blocked')
    );
    return false;
  }

  if (!isPathWithinRoot(destRoot, entry.destination)) {
    log.error(
      {
        destination: entry.destination,
        destRoot,
        reason: 'Destination path escapes worktree root',
      },
      logEvent('worktree-copy', 'path-traversal', 'blocked')
    );
    return false;
  }

  const sourcePath = join(sourceRoot, entry.source);
  const destPath = join(destRoot, entry.destination);

  try {
    const stats = await stat(sourcePath);
    await mkdir(dirname(destPath), { recursive: true });

    if (stats.isDirectory()) {
      await cp(sourcePath, destPath, { recursive: true });
    } else {
      await copyFile(sourcePath, destPath);
    }

    log.debug(
      { source: entry.source, destination: entry.destination },
      logEvent('worktree-copy', 'file', 'copied')
    );
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === 'ENOENT') {
      // Source doesn't exist - expected case, skip silently
      log.debug(
        { source: entry.source },
        logEvent('worktree-copy', 'file', 'skipped-not-found')
      );
      return false;
    }

    log.error(
      {
        source: entry.source,
        destination: entry.destination,
        sourcePath,
        destPath,
        code: err.code ?? 'UNKNOWN',
        message: err.message,
      },
      logEvent('worktree-copy', 'file', 'copy-failed')
    );
    return false;
  }
}

/**
 * Copy all configured files from canonical repo to worktree.
 *
 * @param canonicalRepoPath - Path to the main repository
 * @param worktreePath - Path to the new worktree
 * @param copyFiles - Array of file paths from config
 * @returns Result with successfully copied entries and per-entry status
 */
export async function copyWorktreeFiles(
  canonicalRepoPath: string,
  worktreePath: string,
  copyFiles: string[]
): Promise<CopyWorktreeFilesResult> {
  const copied: CopyFileEntry[] = [];
  const skipped: CopyFileEntry[] = [];
  const failed: CopyFileEntry[] = [];

  for (const fileConfig of copyFiles) {
    let entry: CopyFileEntry;
    try {
      entry = parseCopyFileEntry(fileConfig);
    } catch (parseError) {
      log.error(
        {
          entry: fileConfig,
          message: (parseError as Error).message,
        },
        logEvent('worktree-copy', 'config', 'invalid-entry')
      );
      continue;
    }

    const success = await copyWorktreeFile(canonicalRepoPath, worktreePath, entry);
    if (success) {
      copied.push(entry);
    } else {
      // The copyWorktreeFile helper already logged the reason; we don't
      // distinguish "skipped (ENOENT)" from "failed (EACCES)" at the
      // caller level — both are non-fatal. Use `copied.length` to know
      // the success count.
      skipped.push(entry);
    }
  }

  return { copied, skipped, failed };
}
