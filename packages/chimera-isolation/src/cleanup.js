"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupStaleWorktrees = cleanupStaleWorktrees;
exports.removeWorktree = removeWorktree;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
/**
 * Scan a worktree directory for stale worktrees older than maxAgeMs.
 * Returns a list of stale worktree paths without deleting them.
 */
async function cleanupStaleWorktrees(worktreeDir, maxAgeMs) {
    const staleWorktrees = [];
    const now = Date.now();
    try {
        const entries = await (0, promises_1.readdir)(worktreeDir);
        for (const entry of entries) {
            const entryPath = (0, node_path_1.join)(worktreeDir, entry);
            try {
                const stats = await (0, promises_1.stat)(entryPath);
                if (!stats.isDirectory()) {
                    continue;
                }
                const age = now - stats.mtimeMs;
                if (age > maxAgeMs) {
                    staleWorktrees.push(entryPath);
                }
            }
            catch {
                // Skip entries we can't stat
            }
        }
    }
    catch {
        // Directory doesn't exist or can't be read
    }
    return staleWorktrees;
}
/**
 * Remove a git worktree at the given path.
 * Uses `git worktree remove` which handles locked worktrees gracefully.
 */
async function removeWorktree(path) {
    try {
        await execFileAsync('git', ['worktree', 'remove', path, '--force'], {
            timeout: 10_000,
        });
    }
    catch {
        // Fallback: try to remove the directory directly
        try {
            await (0, promises_1.rm)(path, { recursive: true, force: true });
        }
        catch {
            // Ignore cleanup errors
        }
    }
}
//# sourceMappingURL=cleanup.js.map