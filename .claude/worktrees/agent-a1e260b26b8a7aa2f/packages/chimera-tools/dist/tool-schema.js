"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IGNORED_DIRS = exports.MAX_SHELL_TIMEOUT = exports.DEFAULT_SHELL_TIMEOUT = exports.MAX_OUTPUT_SIZE = exports.MAX_FILE_SIZE = exports.GitCommitSchema = exports.GitFileStatusSchema = exports.SearchMatchSchema = exports.FileEntrySchema = exports.PathSchema = void 0;
const zod_1 = require("zod");
// Shared schemas
exports.PathSchema = zod_1.z.string().min(1, 'Path must not be empty');
exports.FileEntrySchema = zod_1.z.object({
    name: zod_1.z.string(),
    path: zod_1.z.string(),
    type: zod_1.z.enum(['file', 'directory', 'symlink']),
    size: zod_1.z.number().optional(),
    modified: zod_1.z.string().optional(),
});
exports.SearchMatchSchema = zod_1.z.object({
    file: zod_1.z.string(),
    line: zod_1.z.number(),
    column: zod_1.z.number(),
    match: zod_1.z.string(),
    context: zod_1.z.object({
        before: zod_1.z.string(),
        after: zod_1.z.string(),
    }).optional(),
});
exports.GitFileStatusSchema = zod_1.z.object({
    path: zod_1.z.string(),
    status: zod_1.z.string(),
    staged: zod_1.z.boolean().optional(),
});
exports.GitCommitSchema = zod_1.z.object({
    hash: zod_1.z.string(),
    shortHash: zod_1.z.string(),
    author: zod_1.z.string(),
    date: zod_1.z.string(),
    message: zod_1.z.string(),
    files: zod_1.z.array(zod_1.z.string()),
});
// Constants
exports.MAX_FILE_SIZE = 100 * 1024; // 100KB
exports.MAX_OUTPUT_SIZE = 50 * 1024; // 50KB
exports.DEFAULT_SHELL_TIMEOUT = 30_000; // 30s
exports.MAX_SHELL_TIMEOUT = 300_000; // 300s
exports.IGNORED_DIRS = ['node_modules', '.git', 'dist', '.next', '.turbo', 'coverage'];
//# sourceMappingURL=tool-schema.js.map