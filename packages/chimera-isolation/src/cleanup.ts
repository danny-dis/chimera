import { readdir, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Scan a worktree directory for stale worktrees older than maxAgeMs.
 * Returns a list of stale worktree paths without deleting them.
 */
export async function cleanupStaleWorktrees(
  worktreeDir: string,
  maxAgeMs: number,
): Promise<string[]> {
  const staleWorktrees: string[] = [];
  const now = Date.now();

  try {
    const entries = await readdir(worktreeDir);

    for (const entry of entries) {
      const entryPath = join(worktreeDir, entry);

      try {
        const stats = await stat(entryPath);

        if (!stats.isDirectory()) {
          continue;
        }

        const age = now - stats.mtimeMs;

        if (age > maxAgeMs) {
          staleWorktrees.push(entryPath);
        }
      } catch {
        // Skip entries we can't stat
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return staleWorktrees;
}

/**
 * Remove a git worktree at the given path.
 * Uses `git worktree remove` which handles locked worktrees gracefully.
 */
export async function removeWorktree(path: string): Promise<void> {
  try {
    await execFileAsync('git', ['worktree', 'remove', path, '--force'], {
      timeout: 10_000,
    });
  } catch {
    // Fallback: try to remove the directory directly
    try {
      await rm(path, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
