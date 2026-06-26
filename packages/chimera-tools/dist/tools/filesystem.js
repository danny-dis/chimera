"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDirectoryTool = exports.writeFileTool = exports.readFileTool = void 0;
const zod_1 = require("zod");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const tool_schema_js_1 = require("../tool-schema.js");
const media_types_js_1 = require("./media-types.js");
// ── Helpers ──────────────────────────────────────────────────────────────────
function resolveAndValidate(basePath, workspaceRoot) {
    const resolved = path_1.default.resolve(workspaceRoot, basePath);
    if (!resolved.startsWith(path_1.default.resolve(workspaceRoot) + path_1.default.sep) &&
        resolved !== path_1.default.resolve(workspaceRoot)) {
        throw new Error(`Path escapes workspace root: ${basePath}`);
    }
    return resolved;
}
function parseGitignore(content) {
    const rules = [];
    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#'))
            continue;
        let pattern = line;
        const negated = pattern.startsWith('!');
        if (negated)
            pattern = pattern.slice(1);
        // Trailing spaces are ignored unless escaped
        pattern = pattern.replace(/\\ $/, ' ');
        // Anchored if contains / (except trailing)
        const anchored = pattern.includes('/') && !pattern.endsWith('/');
        rules.push({ pattern, negated, anchored });
    }
    return rules;
}
function matchesGitignore(relativePath, rules) {
    let ignored = false;
    for (const rule of rules) {
        if (matchPattern(relativePath, rule.pattern, rule.anchored)) {
            ignored = !rule.negated;
        }
    }
    return ignored;
}
function matchPattern(filePath, pattern, anchored) {
    // Handle directory-only patterns (trailing /)
    const isDirPattern = pattern.endsWith('/');
    const cleanPattern = isDirPattern ? pattern.slice(0, -1) : pattern;
    // If not anchored, match against basename or full path
    if (!anchored) {
        // Match against basename
        const basename = path_1.default.basename(filePath);
        if (minimatchSimple(basename, cleanPattern))
            return true;
        // Match against full path
        if (minimatchSimple(filePath, cleanPattern))
            return true;
        // Match any path segment
        const parts = filePath.split('/');
        for (let i = 0; i < parts.length; i++) {
            const subPath = parts.slice(i).join('/');
            if (minimatchSimple(subPath, cleanPattern))
                return true;
        }
    }
    else {
        if (minimatchSimple(filePath, cleanPattern))
            return true;
    }
    return false;
}
function minimatchSimple(str, pattern) {
    // Convert glob pattern to regex
    let regexStr = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
        .replace(/\*\*/g, '\x00') // Temp placeholder for **
        .replace(/\*/g, '[^/]*') // * matches anything except /
        .replace(/\x00/g, '.*'); // ** matches anything including /
    // Handle ? wildcard
    regexStr = regexStr.replace(/\?/g, '[^/]');
    // Handle character classes
    // Already handled by escaping above, but we need to restore [ and ]
    // Simple approach: just use the regex as-is for common patterns
    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(str);
}
function loadGitignore(dir) {
    const rules = [];
    // Add default ignored dirs
    for (const dir of tool_schema_js_1.IGNORED_DIRS) {
        rules.push({ pattern: dir, negated: false, anchored: false });
    }
    try {
        const content = (0, fs_1.readFileSync)(path_1.default.join(dir, '.gitignore'), 'utf-8');
        rules.push(...parseGitignore(content));
    }
    catch {
        // No .gitignore found
    }
    return rules;
}
// ── read_file ────────────────────────────────────────────────────────────────
const IMG = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif' };
const IMG_MAX = 20 * 1024 * 1024, HEIC_MAX = 10 * 1024 * 1024, PDF_CAP = 100;
async function readImageMedia(p, m) {
    const b = await fs_1.promises.readFile(p);
    const cap = (m === 'image/heic' || m === 'image/heif') ? HEIC_MAX : IMG_MAX;
    if (b.length > cap)
        throw new Error(`Image exceeds ${cap / 1048576}MB limit (${b.length} bytes)`);
    return { kind: 'image', mime: m, base64: b.toString('base64'), bytes: b.length };
}
async function readPdfMedia(p, sp, ep) {
    const mod = await import('pdf-parse');
    const pdfParse = mod.default ?? mod;
    const b = await fs_1.promises.readFile(p);
    const { numpages: pageCount } = await pdfParse(b);
    const lo = Math.max(1, sp);
    const hi = Math.min(ep, pageCount, sp + 99);
    return { pageCount, media: { kind: 'pdf', mime: 'application/pdf', base64: b.toString('base64'), bytes: b.length, pageCount, pages: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) } };
}
const ReadFileParamsSchema = zod_1.z.object({
    path: tool_schema_js_1.PathSchema,
    startLine: zod_1.z.number().int().positive().optional(),
    endLine: zod_1.z.number().int().positive().optional(),
    startPage: zod_1.z.number().int().positive().optional(),
    endPage: zod_1.z.number().int().positive().optional(),
}).refine((d) => (d.startLine ?? d.endLine) === undefined || (d.startPage ?? d.endPage) === undefined, { message: 'startLine/endLine are mutually exclusive with startPage/endPage' });
const ReadFileReturnsSchema = zod_1.z.object({
    content: zod_1.z.string(),
    totalLines: zod_1.z.number(),
    path: zod_1.z.string(),
    media: media_types_js_1.MediaBlockSchema.optional(),
});
exports.readFileTool = {
    name: 'read_file',
    description: 'Read file contents with optional line/page range support; reads images and PDFs natively',
    parameters: ReadFileParamsSchema,
    returns: ReadFileReturnsSchema,
    category: 'filesystem',
    permissionLevel: 'read',
    execute: async (params, context) => {
        const resolved = resolveAndValidate(params.path, context.workspaceRoot);
        const ext = path_1.default.extname(resolved).toLowerCase();
        const m = IMG[ext];
        if (m)
            return { content: '', totalLines: 0, path: params.path, media: await readImageMedia(resolved, m) };
        if (ext === '.pdf') {
            const sp = params.startPage ?? 1, ep = params.endPage ?? sp + 99;
            const { pageCount, media } = await readPdfMedia(resolved, sp, ep);
            const noRange = params.startPage === undefined && params.endPage === undefined;
            return { content: noRange && pageCount > PDF_CAP ? `PDF truncated to first ${PDF_CAP} of ${pageCount} pages` : '', totalLines: 0, path: params.path, media };
        }
        const buffer = await fs_1.promises.readFile(resolved);
        let content = buffer.toString('utf-8');
        const allLines = content.split('\n');
        const totalLines = allLines.length;
        if (content.length > tool_schema_js_1.MAX_FILE_SIZE) {
            content = content.substring(0, tool_schema_js_1.MAX_FILE_SIZE);
            content += '\n... [truncated: file exceeds 100KB]';
        }
        if (params.startLine !== undefined || params.endLine !== undefined) {
            const start = params.startLine ? params.startLine - 1 : 0;
            const end = params.endLine ? params.endLine : allLines.length;
            const sliced = allLines.slice(start, end);
            content = sliced.join('\n');
        }
        return { content, totalLines, path: params.path };
    },
};
// ── write_file ───────────────────────────────────────────────────────────────
const WriteFileParamsSchema = zod_1.z.object({
    path: tool_schema_js_1.PathSchema,
    content: zod_1.z.string(),
    overwrite: zod_1.z.boolean().default(false),
});
const WriteFileReturnsSchema = zod_1.z.object({
    path: zod_1.z.string(),
    bytesWritten: zod_1.z.number(),
    created: zod_1.z.boolean(),
});
exports.writeFileTool = {
    name: 'write_file',
    description: 'Create or overwrite a file, creating parent directories as needed',
    parameters: WriteFileParamsSchema,
    returns: WriteFileReturnsSchema,
    category: 'filesystem',
    permissionLevel: 'write',
    execute: async (params, context) => {
        const resolved = resolveAndValidate(params.path, context.workspaceRoot);
        let created = false;
        try {
            await fs_1.promises.access(resolved);
            if (!params.overwrite) {
                throw new Error(`File already exists and overwrite is false: ${params.path}`);
            }
        }
        catch (err) {
            const code = err.code;
            if (code === 'ENOENT') {
                created = true;
                await fs_1.promises.mkdir(path_1.default.dirname(resolved), { recursive: true });
            }
            else if (!params.overwrite) {
                throw err;
            }
        }
        const content = Buffer.from(params.content, 'utf-8');
        await fs_1.promises.writeFile(resolved, content);
        return { path: params.path, bytesWritten: content.length, created };
    },
};
// ── list_directory ───────────────────────────────────────────────────────────
const ListDirectoryParamsSchema = zod_1.z.object({
    path: zod_1.z.string().optional(),
    depth: zod_1.z.number().int().positive().default(3),
    includeHidden: zod_1.z.boolean().default(false),
    gitignore: zod_1.z.boolean().default(true),
});
const ListDirectoryReturnsSchema = zod_1.z.object({
    entries: zod_1.z.array(tool_schema_js_1.FileEntrySchema),
    path: zod_1.z.string(),
    totalFiles: zod_1.z.number(),
    totalDirs: zod_1.z.number(),
});
async function scanDir(dir, workspaceRoot, maxDepth, includeHidden, rules, currentDepth = 0) {
    if (currentDepth > maxDepth)
        return [];
    const entries = [];
    const items = await fs_1.promises.readdir(dir, { withFileTypes: true });
    for (const item of items) {
        const relativePath = path_1.default.relative(workspaceRoot, path_1.default.join(dir, item.name));
        if (rules && matchesGitignore(relativePath, rules))
            continue;
        if (!includeHidden && item.name.startsWith('.'))
            continue;
        const fullPath = path_1.default.join(dir, item.name);
        if (item.isDirectory()) {
            entries.push({ name: item.name, path: relativePath, type: 'directory' });
            const children = await scanDir(fullPath, workspaceRoot, maxDepth, includeHidden, rules, currentDepth + 1);
            entries.push(...children);
        }
        else if (item.isFile() || item.isSymbolicLink()) {
            let size;
            try {
                const stat = await fs_1.promises.stat(fullPath);
                size = stat.size;
            }
            catch {
                // Skip inaccessible files
            }
            entries.push({
                name: item.name,
                path: relativePath,
                type: item.isSymbolicLink() ? 'symlink' : 'file',
                size,
            });
        }
    }
    return entries;
}
exports.listDirectoryTool = {
    name: 'list_directory',
    description: 'List directory tree with gitignore awareness and depth control',
    parameters: ListDirectoryParamsSchema,
    returns: ListDirectoryReturnsSchema,
    category: 'filesystem',
    permissionLevel: 'read',
    execute: async (rawParams, context) => {
        // Apply Zod defaults so direct callers (e.g. tests) get the same
        // behavior as the registry, which already runs `parse()`.
        const params = ListDirectoryParamsSchema.parse(rawParams);
        const targetPath = params.path
            ? resolveAndValidate(params.path, context.workspaceRoot)
            : context.workspaceRoot;
        const rules = params.gitignore ? loadGitignore(targetPath) : null;
        const entries = await scanDir(targetPath, context.workspaceRoot, params.depth, params.includeHidden, rules);
        const totalFiles = entries.filter((e) => e.type === 'file').length;
        const totalDirs = entries.filter((e) => e.type === 'directory').length;
        return {
            entries,
            path: params.path ?? '.',
            totalFiles,
            totalDirs,
        };
    },
};
//# sourceMappingURL=filesystem.js.map