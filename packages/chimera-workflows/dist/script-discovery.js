"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverScriptsForCwd = discoverScriptsForCwd;
/**
 * Script discovery for workflow script nodes.
 * Finds .ts (bun) and .py (uv) scripts in repo and home directories.
 */
const path_1 = require("path");
const promises_1 = require("fs/promises");
const os_1 = require("os");
const SCRIPT_DIRS = ['.archon/scripts', (0, path_1.join)((0, os_1.homedir)(), '.archon/scripts')];
function detectRuntime(filename) {
    if (filename.endsWith('.ts') || filename.endsWith('.tsx'))
        return 'bun';
    if (filename.endsWith('.py'))
        return 'uv';
    return null;
}
async function discoverScriptsForCwd(cwd) {
    const scripts = new Map();
    for (const dir of SCRIPT_DIRS) {
        const fullPath = dir.startsWith('/') ? dir : (0, path_1.join)(cwd, dir);
        try {
            const entries = await (0, promises_1.readdir)(fullPath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isFile())
                    continue;
                const runtime = detectRuntime(entry.name);
                if (!runtime)
                    continue;
                const name = entry.name.replace(/\.(ts|tsx|py)$/, '');
                if (!scripts.has(name)) {
                    scripts.set(name, {
                        name,
                        path: (0, path_1.join)(fullPath, entry.name),
                        runtime,
                    });
                }
            }
        }
        catch {
            // Directory doesn't exist or can't be read — skip
        }
    }
    return scripts;
}
//# sourceMappingURL=script-discovery.js.map