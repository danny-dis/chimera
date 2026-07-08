"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IGNORED_DIRS = exports.MAX_SHELL_TIMEOUT = exports.DEFAULT_SHELL_TIMEOUT = exports.MAX_OUTPUT_SIZE = exports.MAX_FILE_SIZE = exports.GitCommitSchema = exports.GitFileStatusSchema = exports.SearchMatchSchema = exports.FileEntrySchema = exports.PathSchema = void 0;
exports.zodToJsonSchema = zodToJsonSchema;
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
/**
 * Convert a Zod schema into an OpenAI-style JSON schema object the model
 * API can consume. Zod schemas have no built-in `.toJSON()`, so the previous
 * `t.parameters?.toJSON?.() ?? {}` produced an empty `parameters: {}` — which
 * silently broke tool calling (the model narrated tool names instead of
 * emitting structured tool_calls). This handles the shapes Chimera's tools
 * actually use: object, string, number, boolean, array, enum, optional,
 * nullable, and `.default()`.
 */
function zodToJsonSchema(schema) {
    const def = schema._def ?? {};
    const type = def.typeName;
    switch (type) {
        case 'ZodObject': {
            const shape = def.shape();
            const properties = {};
            const required = [];
            for (const [key, val] of Object.entries(shape)) {
                properties[key] = zodToJsonSchema(val);
                const v = val;
                const isOptional = v._def?.typeName === 'ZodOptional' ||
                    v._def?.typeName === 'ZodNullable' ||
                    v._def?.typeName === 'ZodDefault';
                if (!isOptional)
                    required.push(key);
            }
            return { type: 'object', properties, ...(required.length ? { required } : {}) };
        }
        case 'ZodString':
            return { type: 'string' };
        case 'ZodNumber':
            return { type: 'number' };
        case 'ZodBoolean':
            return { type: 'boolean' };
        case 'ZodArray':
            return { type: 'array', items: zodToJsonSchema(def.type().element) };
        case 'ZodEnum':
            return { type: 'string', enum: def.values };
        case 'ZodOptional':
        case 'ZodNullable':
            return zodToJsonSchema(def.innerType());
        case 'ZodDefault':
            return zodToJsonSchema(def.innerType());
        default:
            return { type: 'string' };
    }
}
//# sourceMappingURL=tool-schema.js.map