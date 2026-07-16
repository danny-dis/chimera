"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findFolderTool = void 0;
const zod_1 = require("zod");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
// ── find_folder ────────────────────────────────────────────────────────────
// Locates a directory *by its name* (glob or substring) under a search root.
// The content-search tools (search_files / glob_files) can only match file
// contents / file names — they cannot answer "where is the folder called X".
// That gap is what made "find this folder and cd into it" fail no matter how
// many times the user spelled out the path.
const FindFolderParamsSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Folder name must not be empty'),
    path: zod_1.z.string().optional().describe('Search root. Defaults to workspaceRoot. Accepts absolute paths.'),
    maxResults: zod_1.z.number().int().positive().default(50),
    depth: zod_1.z.number().int().positive().default(8),
    caseSensitive: zod_1.z.boolean().default(false),
});
const FindFolderReturnsSchema = zod_1.z.object({
    folders: zod_1.z.array(zod_1.z.string()),
    count: zod_1.z.number(),
    searched: zod_1.z.string(),
});
// Dirs we skip by default to keep scans bounded (ponytail: drop whole-subtree
// scan of dependency/metadata dirs; revisit if a user genuinely needs them).
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'target', '__pycache__']);
function matchName(basename, pattern, caseSensitive) {
    const a = caseSensitive ? basename : basename.toLowerCase();
    const b = caseSensitive ? pattern : pattern.toLowerCase();
    if (pattern.includes('*') || pattern.includes('?')) {
        const regex = new RegExp('^' +
            b
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.') +
            '$');
        return regex.test(a);
    }
    return a.includes(b);
}
exports.findFolderTool = {
    name: 'find_folder',
    description: 'Find directories by name (glob or substring) under a search root. Use this to locate a folder before navigating into it.',
    parameters: FindFolderParamsSchema,
    returns: FindFolderReturnsSchema,
    category: 'search',
    permissionLevel: 'read',
    execute: async (params, context) => {
        params = FindFolderParamsSchema.parse(params);
        const searchRoot = params.path
            ? path_1.default.isAbsolute(params.path)
                ? path_1.default.resolve(params.path)
                : path_1.default.resolve(context.workspaceRoot, params.path)
            : path_1.default.resolve(context.workspaceRoot);
        const found = [];
        const seen = new Set();
        async function walk(dir, currentDepth) {
            if (found.length >= params.maxResults)
                return;
            if (currentDepth > params.depth)
                return;
            let entries;
            try {
                const real = await fs_1.promises.realpath(dir).catch(() => dir);
                if (seen.has(real))
                    return;
                seen.add(real);
                entries = await fs_1.promises.readdir(dir, { withFileTypes: true });
            }
            catch {
                return; // inaccessible dir
            }
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                const full = path_1.default.join(dir, entry.name);
                if (matchName(entry.name, params.name, params.caseSensitive)) {
                    found.push(full);
                    if (found.length >= params.maxResults)
                        return;
                }
                if (SKIP_DIRS.has(entry.name))
                    continue;
                await walk(full, currentDepth + 1);
            }
        }
        await walk(searchRoot, 0);
        return { folders: found, count: found.length, searched: searchRoot };
    },
};
//# sourceMappingURL=find-folder.js.map