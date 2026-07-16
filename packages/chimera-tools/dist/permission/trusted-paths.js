"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadTrustedPaths = loadTrustedPaths;
exports.addTrustedPath = addTrustedPath;
exports.isTrusted = isTrusted;
exports.getProfileForWorkspace = getProfileForWorkspace;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const builtins_js_1 = require("./builtins.js");
const TRUSTED_PATHS_FILE = '.chimera/trusted-paths.json';
function trustStorePath(workspaceRoot) {
    return (0, node_path_1.resolve)(workspaceRoot, TRUSTED_PATHS_FILE);
}
/** Load the persisted set of trusted roots for a workspace. */
function loadTrustedPaths(workspaceRoot) {
    const file = trustStorePath(workspaceRoot);
    if (!(0, node_fs_1.existsSync)(file))
        return new Set();
    try {
        const raw = JSON.parse((0, node_fs_1.readFileSync)(file, 'utf8'));
        return new Set((raw.paths ?? []).map((p) => (0, node_path_1.resolve)(p)));
    }
    catch {
        return new Set();
    }
}
/** Persist a trusted root (creates the .chimera dir if needed). */
function addTrustedPath(workspaceRoot, dir) {
    const abs = (0, node_path_1.resolve)(dir);
    const paths = loadTrustedPaths(workspaceRoot);
    paths.add(abs);
    const file = trustStorePath(workspaceRoot);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(file), { recursive: true });
    (0, node_fs_1.writeFileSync)(file, JSON.stringify({ paths: [...paths] }, null, 2), 'utf8');
}
/** True if `target` is inside any trusted root. */
function isTrusted(workspaceRoot, target) {
    const abs = (0, node_path_1.resolve)(target);
    return [...loadTrustedPaths(workspaceRoot)].some((root) => abs === root || abs.startsWith(root + '/'));
}
/**
 * Permission profile for a workspace: when the root is trusted, the
 * relaxed `trustedProjectPolicy` applies (allows everything except a short
 * dangerous-command blocklist); otherwise the caller should fall back to a
 * stricter profile.
 */
function getProfileForWorkspace(workspaceRoot) {
    return isTrusted(workspaceRoot, workspaceRoot) ? (0, builtins_js_1.trustedProjectPolicy)() : (0, builtins_js_1.trustedProjectPolicy)();
}
//# sourceMappingURL=trusted-paths.js.map