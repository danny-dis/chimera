"use strict";
/**
 * Worktree file copy utility
 *
 * Copies git-ignored files from the canonical repo to a new worktree
 * based on configuration in `.archon/config.yaml` (or chimera's own
 * user-facing config — see TODO in errors.ts).
 *
 * Ported from research/archon/packages/isolation/src/worktree-copy.ts @ 2026-06-15.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCopyFileEntry = parseCopyFileEntry;
exports.isPathWithinRoot = isPathWithinRoot;
exports.copyWorktreeFile = copyWorktreeFile;
exports.copyWorktreeFiles = copyWorktreeFiles;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const paths_1 = require("@chimera/paths");
const log = (0, paths_1.createLogger)('isolation.worktree-copy');
/**
 * Parse a copy file entry from config.
 * Each entry is a path to a git-ignored file or directory to copy into worktrees.
 *
 * @param entry - Config entry like ".env" or "data/fixtures/"
 * @returns Parsed source and destination (always identical)
 * @throws Error if entry is empty
 */
function parseCopyFileEntry(entry) {
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
function isPathWithinRoot(root, filePath) {
    const fullPath = (0, node_path_1.normalize)((0, node_path_1.join)(root, filePath));
    const normalizedRoot = (0, node_path_1.normalize)(root);
    const relativePath = (0, node_path_1.relative)(normalizedRoot, fullPath);
    if (relativePath.startsWith('..') || (0, node_path_1.isAbsolute)(relativePath)) {
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
async function copyWorktreeFile(sourceRoot, destRoot, entry) {
    if (!isPathWithinRoot(sourceRoot, entry.source)) {
        log.error({
            source: entry.source,
            sourceRoot,
            reason: 'Source path escapes repository root',
        }, (0, paths_1.logEvent)('worktree-copy', 'path-traversal', 'blocked'));
        return false;
    }
    if (!isPathWithinRoot(destRoot, entry.destination)) {
        log.error({
            destination: entry.destination,
            destRoot,
            reason: 'Destination path escapes worktree root',
        }, (0, paths_1.logEvent)('worktree-copy', 'path-traversal', 'blocked'));
        return false;
    }
    const sourcePath = (0, node_path_1.join)(sourceRoot, entry.source);
    const destPath = (0, node_path_1.join)(destRoot, entry.destination);
    try {
        const stats = await (0, promises_1.stat)(sourcePath);
        await (0, promises_1.mkdir)((0, node_path_1.dirname)(destPath), { recursive: true });
        if (stats.isDirectory()) {
            await (0, promises_1.cp)(sourcePath, destPath, { recursive: true });
        }
        else {
            await (0, promises_1.copyFile)(sourcePath, destPath);
        }
        log.debug({ source: entry.source, destination: entry.destination }, (0, paths_1.logEvent)('worktree-copy', 'file', 'copied'));
        return true;
    }
    catch (error) {
        const err = error;
        if (err.code === 'ENOENT') {
            // Source doesn't exist - expected case, skip silently
            log.debug({ source: entry.source }, (0, paths_1.logEvent)('worktree-copy', 'file', 'skipped-not-found'));
            return false;
        }
        log.error({
            source: entry.source,
            destination: entry.destination,
            sourcePath,
            destPath,
            code: err.code ?? 'UNKNOWN',
            message: err.message,
        }, (0, paths_1.logEvent)('worktree-copy', 'file', 'copy-failed'));
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
async function copyWorktreeFiles(canonicalRepoPath, worktreePath, copyFiles) {
    const copied = [];
    const skipped = [];
    const failed = [];
    for (const fileConfig of copyFiles) {
        let entry;
        try {
            entry = parseCopyFileEntry(fileConfig);
        }
        catch (parseError) {
            log.error({
                entry: fileConfig,
                message: parseError.message,
            }, (0, paths_1.logEvent)('worktree-copy', 'config', 'invalid-entry'));
            continue;
        }
        const success = await copyWorktreeFile(canonicalRepoPath, worktreePath, entry);
        if (success) {
            copied.push(entry);
        }
        else {
            // The copyWorktreeFile helper already logged the reason; we don't
            // distinguish "skipped (ENOENT)" from "failed (EACCES)" at the
            // caller level — both are non-fatal. Use `copied.length` to know
            // the success count.
            skipped.push(entry);
        }
    }
    return { copied, skipped, failed };
}
//# sourceMappingURL=worktree-copy.js.map