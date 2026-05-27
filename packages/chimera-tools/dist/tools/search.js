"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globFilesTool = exports.searchFilesTool = void 0;
const zod_1 = require("zod");
const execa_1 = require("execa");
const path_1 = __importDefault(require("path"));
const tool_schema_js_1 = require("../tool-schema.js");
// ── search_files ─────────────────────────────────────────────────────────────
const SearchFilesParamsSchema = zod_1.z.object({
    pattern: zod_1.z.string().min(1, 'Pattern must not be empty'),
    path: zod_1.z.string().optional(),
    include: zod_1.z.array(zod_1.z.string()).optional(),
    exclude: zod_1.z.array(zod_1.z.string()).optional(),
    caseSensitive: zod_1.z.boolean().default(false),
    maxResults: zod_1.z.number().int().positive().default(100),
});
const SearchFilesReturnsSchema = zod_1.z.object({
    matches: zod_1.z.array(tool_schema_js_1.SearchMatchSchema),
    totalMatches: zod_1.z.number(),
    filesSearched: zod_1.z.number(),
});
async function findRgPath() {
    try {
        const { stdout } = await (0, execa_1.execa)('which', ['rg'], { reject: false });
        return stdout.trim() || null;
    }
    catch {
        return null;
    }
}
exports.searchFilesTool = {
    name: 'search_files',
    description: 'Search file contents using ripgrep (rg) with gitignore support',
    parameters: SearchFilesParamsSchema,
    returns: SearchFilesReturnsSchema,
    category: 'search',
    permissionLevel: 'read',
    execute: async (params, context) => {
        const searchPath = params.path
            ? path_1.default.resolve(context.workspaceRoot, params.path)
            : context.workspaceRoot;
        const rgPath = await findRgPath();
        const command = rgPath ?? 'grep';
        const args = [];
        if (command.endsWith('rg')) {
            args.push('--json', '--no-heading', '--line-number', '--column', '--max-count', String(params.maxResults));
            if (params.caseSensitive) {
                args.push('--case-sensitive');
            }
            else {
                args.push('--ignore-case');
            }
            if (params.include?.length) {
                for (const glob of params.include) {
                    args.push('--glob', glob);
                }
            }
            if (params.exclude?.length) {
                for (const glob of params.exclude) {
                    args.push('--glob', `!${glob}`);
                }
            }
            args.push('--', params.pattern, searchPath);
        }
        else {
            // Fallback to grep
            args.push('-rn');
            if (params.caseSensitive) {
                args.push('--fixed-strings');
            }
            else {
                args.push('-i');
            }
            args.push(params.pattern, searchPath);
        }
        let stdout = '';
        let exitCode = 0;
        try {
            const result = await (0, execa_1.execa)(command, args, {
                cwd: context.workspaceRoot,
                timeout: 30_000,
                maxBuffer: tool_schema_js_1.MAX_OUTPUT_SIZE,
                reject: false,
            });
            stdout = result.stdout;
            exitCode = result.exitCode ?? 0;
        }
        catch {
            // Timeout or other error — return what we have
        }
        // grep returns 1 when no match (not an error)
        if (exitCode > 1) {
            return { matches: [], totalMatches: 0, filesSearched: 0 };
        }
        const matches = [];
        const filesSearched = new Set();
        if (command.endsWith('rg')) {
            // Parse JSON lines output from ripgrep
            const lines = stdout.split('\n').filter(Boolean);
            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.type === 'match') {
                        const data = parsed.data;
                        const match = {
                            file: path_1.default.relative(context.workspaceRoot, data.path.text),
                            line: data.line_number,
                            column: data.submatches[0]?.start ?? 0,
                            match: data.lines.text.trim(),
                        };
                        matches.push(match);
                        filesSearched.add(match.file);
                    }
                    else if (parsed.type === 'begin') {
                        filesSearched.add(path_1.default.relative(context.workspaceRoot, parsed.data.path.text));
                    }
                }
                catch {
                    // Skip unparseable lines
                }
            }
        }
        else {
            // Parse grep output: file:line:column:match
            const lines = stdout.split('\n').filter(Boolean);
            for (const line of lines) {
                const match = line.match(/^(.+?):(\d+):(\d+):(.*)$/);
                if (match) {
                    const filePath = path_1.default.relative(context.workspaceRoot, match[1]);
                    filesSearched.add(filePath);
                    matches.push({
                        file: filePath,
                        line: parseInt(match[2], 10),
                        column: parseInt(match[3], 10),
                        match: match[4].trim(),
                    });
                }
            }
        }
        return {
            matches: matches.slice(0, params.maxResults),
            totalMatches: matches.length,
            filesSearched: filesSearched.size,
        };
    },
};
// ── glob_files ───────────────────────────────────────────────────────────────
const GlobFilesParamsSchema = zod_1.z.object({
    pattern: zod_1.z.string().min(1, 'Pattern must not be empty'),
    path: zod_1.z.string().optional(),
});
const GlobFilesReturnsSchema = zod_1.z.object({
    files: zod_1.z.array(zod_1.z.string()),
    count: zod_1.z.number(),
});
exports.globFilesTool = {
    name: 'glob_files',
    description: 'Match files using glob patterns',
    parameters: GlobFilesParamsSchema,
    returns: GlobFilesReturnsSchema,
    category: 'search',
    permissionLevel: 'read',
    execute: async (params, context) => {
        const searchPath = params.path
            ? path_1.default.resolve(context.workspaceRoot, params.path)
            : context.workspaceRoot;
        const rgPath = await findRgPath();
        const command = rgPath ?? 'find';
        let stdout = '';
        try {
            if (command.endsWith('rg')) {
                const result = await (0, execa_1.execa)('rg', [
                    '--files',
                    '--glob', params.pattern,
                    searchPath,
                ], {
                    cwd: context.workspaceRoot,
                    timeout: 15_000,
                    maxBuffer: tool_schema_js_1.MAX_OUTPUT_SIZE,
                    reject: false,
                });
                stdout = result.stdout;
            }
            else {
                // Fallback: use find with -name
                const result = await (0, execa_1.execa)('find', [
                    searchPath,
                    '-name', params.pattern,
                ], {
                    timeout: 15_000,
                    maxBuffer: tool_schema_js_1.MAX_OUTPUT_SIZE,
                    reject: false,
                });
                stdout = result.stdout;
            }
        }
        catch {
            return { files: [], count: 0 };
        }
        const files = stdout
            .split('\n')
            .filter(Boolean)
            .map((f) => path_1.default.relative(context.workspaceRoot, f))
            .slice(0, 500);
        return { files, count: files.length };
    },
};
//# sourceMappingURL=search.js.map