"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.toRepoPath = toRepoPath;
exports.toBranchName = toBranchName;
exports.toWorktreePath = toWorktreePath;
exports.unwrap = unwrap;
// ---------------------------------------------------------------------------
// Construction helpers
// ---------------------------------------------------------------------------
// The ONLY place that can produce a brand. Use these to make brand
// acquisition explicit at the call site.
function toRepoPath(s) {
    return s;
}
function toBranchName(s) {
    return s;
}
function toWorktreePath(s) {
    return s;
}
/** Unwrap a branded path back to a plain string. Use only at the I/O boundary. */
function unwrap(b) {
    return b;
}
//# sourceMappingURL=branded.js.map