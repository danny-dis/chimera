"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchReplaceTool = exports.editFileTool = exports.editBlockTool = exports.applyPatchTool = void 0;
const zod_1 = require("zod");
const execa_1 = require("execa");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const tool_schema_js_1 = require("../tool-schema.js");
function resolveAndValidate(basePath, workspaceRoot) {
    const resolved = path_1.default.resolve(workspaceRoot, basePath);
    if (!resolved.startsWith(path_1.default.resolve(workspaceRoot) + path_1.default.sep) &&
        resolved !== path_1.default.resolve(workspaceRoot)) {
        throw new Error(`Path escapes workspace root: ${basePath}`);
    }
    return resolved;
}
// ── apply_patch ──────────────────────────────────────────────────────────────
const ApplyPatchParamsSchema = zod_1.z.object({
    patch: zod_1.z.string().min(1, 'Patch must not be empty'),
    path: zod_1.z.string().optional(),
    dryRun: zod_1.z.boolean().default(false),
});
const ApplyPatchReturnsSchema = zod_1.z.object({
    applied: zod_1.z.boolean(),
    filesChanged: zod_1.z.array(zod_1.z.string()),
    hunksApplied: zod_1.z.number(),
    hunksFailed: zod_1.z.number(),
    rejectFiles: zod_1.z.array(zod_1.z.string()),
});
exports.applyPatchTool = {
    name: 'apply_patch',
    description: 'Apply a unified diff patch with dry-run support and partial apply handling',
    parameters: ApplyPatchParamsSchema,
    returns: ApplyPatchReturnsSchema,
    category: 'edit',
    permissionLevel: 'write',
    execute: async (params, context) => {
        const workingDir = params.path
            ? path_1.default.resolve(context.workspaceRoot, params.path)
            : context.workspaceRoot;
        // Write patch to temp file
        const patchFile = path_1.default.join(context.workspaceRoot, '.chimera-patch-tmp.diff');
        await fs_1.promises.writeFile(patchFile, params.patch, 'utf-8');
        // Create backups of affected files before applying
        const filesToBackup = extractFilesFromPatch(params.patch);
        const backupDir = path_1.default.join(context.workspaceRoot, '.chimera-backup');
        if (!params.dryRun) {
            await fs_1.promises.mkdir(backupDir, { recursive: true });
            for (const file of filesToBackup) {
                const fullPath = path_1.default.resolve(context.workspaceRoot, file);
                try {
                    const backupPath = path_1.default.join(backupDir, file.replace(/\//g, '__'));
                    await fs_1.promises.copyFile(fullPath, backupPath);
                }
                catch {
                    // File may not exist yet (new file in patch)
                }
            }
        }
        try {
            if (params.dryRun) {
                const result = await (0, execa_1.execa)('git', ['apply', '--check', '--verbose', patchFile], {
                    cwd: workingDir,
                    timeout: 30_000,
                    maxBuffer: tool_schema_js_1.MAX_OUTPUT_SIZE,
                    reject: false,
                });
                if (result.exitCode !== 0) {
                    return {
                        applied: false,
                        filesChanged: [],
                        hunksApplied: 0,
                        hunksFailed: 0,
                        rejectFiles: [],
                    };
                }
                return {
                    applied: true,
                    filesChanged: filesToBackup,
                    hunksApplied: countHunks(params.patch),
                    hunksFailed: 0,
                    rejectFiles: [],
                };
            }
            // Actual apply
            const result = await (0, execa_1.execa)('git', ['apply', '--verbose', patchFile], {
                cwd: workingDir,
                timeout: 30_000,
                maxBuffer: tool_schema_js_1.MAX_OUTPUT_SIZE,
                reject: false,
            });
            if (result.exitCode === 0) {
                return {
                    applied: true,
                    filesChanged: filesToBackup,
                    hunksApplied: countHunks(params.patch),
                    hunksFailed: 0,
                    rejectFiles: [],
                };
            }
            // Try partial apply with --reject
            const rejectResult = await (0, execa_1.execa)('git', ['apply', '--reject', '--verbose', patchFile], {
                cwd: workingDir,
                timeout: 30_000,
                maxBuffer: tool_schema_js_1.MAX_OUTPUT_SIZE,
                reject: false,
            });
            // Find .rej files
            const rejectFiles = [];
            try {
                const findResult = await (0, execa_1.execa)('find', [workingDir, '-name', '*.rej'], {
                    timeout: 10_000,
                    maxBuffer: tool_schema_js_1.MAX_OUTPUT_SIZE,
                    reject: false,
                });
                if (findResult.stdout.trim()) {
                    rejectFiles.push(...findResult.stdout.trim().split('\n'));
                }
            }
            catch {
                // No .rej files found
            }
            return {
                applied: rejectResult.exitCode === 0 || rejectFiles.length === 0,
                filesChanged: filesToBackup,
                hunksApplied: countHunks(params.patch) - rejectFiles.length,
                hunksFailed: rejectFiles.length,
                rejectFiles,
            };
        }
        finally {
            // Clean up temp patch file
            try {
                await fs_1.promises.unlink(patchFile);
            }
            catch {
                // Ignore cleanup errors
            }
        }
    },
};
function extractFilesFromPatch(patch) {
    const files = new Set();
    const lines = patch.split('\n');
    for (const line of lines) {
        if (line.startsWith('--- a/') || line.startsWith('+++ b/')) {
            const file = line.replace(/^--- a\//, '').replace(/^\+\+\+ b\//, '').replace(/^\/dev\/null$/, '');
            if (file)
                files.add(file);
        }
    }
    return Array.from(files);
}
function countHunks(patch) {
    let count = 0;
    for (const line of patch.split('\n')) {
        if (line.startsWith('@@'))
            count++;
    }
    return count;
}
// ── edit_block ───────────────────────────────────────────────────────────────
const EditBlockParamsSchema = zod_1.z.object({
    path: tool_schema_js_1.PathSchema,
    oldText: zod_1.z.string().min(1, 'oldText must not be empty'),
    newText: zod_1.z.string(),
    replaceAll: zod_1.z.boolean().default(false),
});
const EditBlockReturnsSchema = zod_1.z.object({
    applied: zod_1.z.boolean(),
    path: zod_1.z.string(),
    replacements: zod_1.z.number(),
});
exports.editBlockTool = {
    name: 'edit_block',
    description: 'Targeted text replacement in a file with exact match',
    parameters: EditBlockParamsSchema,
    returns: EditBlockReturnsSchema,
    category: 'edit',
    permissionLevel: 'write',
    execute: async (params, context) => {
        const resolved = path_1.default.resolve(context.workspaceRoot, params.path);
        if (!resolved.startsWith(path_1.default.resolve(context.workspaceRoot) + path_1.default.sep) &&
            resolved !== path_1.default.resolve(context.workspaceRoot)) {
            throw new Error(`Path escapes workspace root: ${params.path}`);
        }
        const content = await fs_1.promises.readFile(resolved, 'utf-8');
        // Exact match first.
        const firstIndex = content.indexOf(params.oldText);
        if (firstIndex === -1) {
            // Lenient fallback: models (esp. small/cheap ones) often emit a partial
            // or truncated oldText. Anchor on the first line that *contains* the
            // snippet and replace that whole line. This turns a hard "not found"
            // failure into a best-effort edit instead of dropping the change.
            const needle = params.oldText.trim();
            if (needle.length > 0) {
                const lines = content.split('\n');
                const lineIdx = lines.findIndex((ln) => ln.includes(needle));
                if (lineIdx !== -1) {
                    lines[lineIdx] = params.newText;
                    const newContent = lines.join('\n');
                    await fs_1.promises.writeFile(resolved, newContent, 'utf-8');
                    return { applied: true, path: params.path, replacements: 1 };
                }
            }
            // Provide helpful suggestions
            const similarLines = findSimilarLines(content, params.oldText);
            throw new Error(`oldText not found in file. Similar lines found:\n${similarLines.join('\n')}`);
        }
        let replacements = 0;
        let newContent;
        if (params.replaceAll) {
            const parts = content.split(params.oldText);
            replacements = parts.length - 1;
            newContent = parts.join(params.newText);
        }
        else {
            // Single replacement
            newContent =
                content.substring(0, firstIndex) +
                    params.newText +
                    content.substring(firstIndex + params.oldText.length);
            replacements = 1;
        }
        await fs_1.promises.writeFile(resolved, newContent, 'utf-8');
        return { applied: true, path: params.path, replacements };
    },
};
// ── edit_file (alias of edit_block, the name the harness advertises) ─────────
// `coreToolsForTier` and the permission policies reference `edit_file`, but the
// underlying implementation is registered as `edit_block`. Without this alias a
// model that emits an `edit_file` tool call has no matching tool, so the call is
// silently dropped and the model falls back to describing the edit in prose.
// Accepts both `old_string`/`new_string` and `oldText`/`newText` spellings.
const EditFileParamsSchema = zod_1.z
    .object({
    path: tool_schema_js_1.PathSchema,
    old_string: zod_1.z.string().optional(),
    new_string: zod_1.z.string().optional(),
    oldText: zod_1.z.string().optional(),
    newText: zod_1.z.string().optional(),
    replaceAll: zod_1.z.boolean().default(false),
})
    .refine((d) => (d.old_string ?? d.oldText) !== undefined && (d.new_string ?? d.newText) !== undefined, { message: 'Either old_string/oldText and new_string/newText must be provided' });
const EditFileReturnsSchema = zod_1.z.object({
    applied: zod_1.z.boolean(),
    path: zod_1.z.string(),
    replacements: zod_1.z.number(),
});
exports.editFileTool = {
    name: 'edit_file',
    description: 'Edit an existing file by replacing an exact old_string/oldText with new_string/newText.',
    parameters: EditFileParamsSchema,
    returns: EditFileReturnsSchema,
    category: 'edit',
    permissionLevel: 'write',
    execute: async (params, context) => {
        const oldText = (params.old_string ?? params.oldText);
        const newText = (params.new_string ?? params.newText ?? '');
        return exports.editBlockTool.execute({ path: params.path, oldText, newText, replaceAll: params.replaceAll }, context);
    },
};
const SearchReplaceParamsSchema = zod_1.z.object({
    path: tool_schema_js_1.PathSchema,
    blocks: zod_1.z.array(zod_1.z.object({
        search: zod_1.z.string().min(1, 'search block must not be empty'),
        replace: zod_1.z.string(),
    })).optional(),
    text: zod_1.z.string().optional(),
}).refine((data) => (data.blocks && data.blocks.length > 0) || (data.text && data.text.length > 0), { message: 'Either blocks or text must be provided' });
const SearchReplaceReturnsSchema = zod_1.z.object({
    applied: zod_1.z.boolean(),
    path: zod_1.z.string(),
    replacements: zod_1.z.number(),
    failures: zod_1.z.array(zod_1.z.object({
        search: zod_1.z.string(),
        reason: zod_1.z.string(),
        similarLines: zod_1.z.array(zod_1.z.string()),
    })),
});
function parseSearchReplaceBlocks(text) {
    const blocks = [];
    const lines = text.split('\n');
    let currentBlock = null;
    let section = null;
    for (const line of lines) {
        if (line.startsWith('<<<<<<< SEARCH')) {
            currentBlock = { search: '', replace: '' };
            section = 'search';
            continue;
        }
        if (line.trim() === '=======') {
            section = 'replace';
            continue;
        }
        if (line.startsWith('>>>>>>> REPLACE')) {
            if (currentBlock?.search !== undefined && currentBlock?.replace !== undefined) {
                blocks.push(currentBlock);
            }
            currentBlock = null;
            section = null;
            continue;
        }
        if (currentBlock && section === 'search') {
            currentBlock.search += (currentBlock.search ? '\n' : '') + line;
        }
        else if (currentBlock && section === 'replace') {
            currentBlock.replace += (currentBlock.replace ? '\n' : '') + line;
        }
    }
    return blocks;
}
exports.searchReplaceTool = {
    name: 'search_replace',
    description: 'Apply search-and-replace edits to a file. Accepts either structured blocks or raw SEARCH/REPLACE text format.',
    parameters: SearchReplaceParamsSchema,
    returns: SearchReplaceReturnsSchema,
    category: 'edit',
    permissionLevel: 'write',
    execute: async (params, context) => {
        const resolved = resolveAndValidate(params.path, context.workspaceRoot);
        let content = await fs_1.promises.readFile(resolved, 'utf-8');
        let totalReplacements = 0;
        const failures = [];
        // Resolve blocks from either structured input or raw text
        const blocks = params.blocks ?? parseSearchReplaceBlocks(params.text);
        for (const block of blocks) {
            const index = content.indexOf(block.search);
            if (index === -1) {
                failures.push({
                    search: block.search.slice(0, 100),
                    reason: 'Search text not found in file',
                    similarLines: findSimilarLines(content, block.search),
                });
                continue;
            }
            const parts = content.split(block.search);
            const count = parts.length - 1;
            content = parts.join(block.replace);
            totalReplacements += count;
        }
        if (totalReplacements > 0) {
            await fs_1.promises.writeFile(resolved, content, 'utf-8');
        }
        return {
            applied: totalReplacements > 0,
            path: params.path,
            replacements: totalReplacements,
            failures,
        };
    },
};
function findSimilarLines(content, searchText, maxResults = 3) {
    const lines = content.split('\n');
    const searchLower = searchText.toLowerCase();
    const scored = lines
        .map((line, index) => ({
        line: line.trim(),
        index: index + 1,
        score: similarity(line.toLowerCase(), searchLower),
    }))
        .filter((item) => item.score > 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
    return scored.map((item) => `Line ${item.index}: ${item.line}`);
}
function similarity(a, b) {
    if (a.length === 0 || b.length === 0)
        return 0;
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    if (longer.includes(shorter))
        return shorter.length / longer.length;
    // Simple character overlap
    const longerArr = longer.split('');
    let matches = 0;
    for (const char of shorter) {
        const idx = longerArr.indexOf(char);
        if (idx !== -1) {
            matches++;
            longerArr.splice(idx, 1);
        }
    }
    return matches / longer.length;
}
//# sourceMappingURL=edit.js.map