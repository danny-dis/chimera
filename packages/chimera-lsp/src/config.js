"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LSP_CONFIG = exports.LspConfigSchema = exports.LspServerConfigSchema = void 0;
exports.loadLspConfig = loadLspConfig;
exports.mergeLspConfig = mergeLspConfig;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const yaml_1 = __importDefault(require("yaml"));
const zod_1 = require("zod");
exports.LspServerConfigSchema = zod_1.z.object({
    name: zod_1.z.string().optional(),
    command: zod_1.z.string().min(1),
    args: zod_1.z.array(zod_1.z.string()).default([]),
    cwd: zod_1.z.string().optional(),
    filePatterns: zod_1.z.array(zod_1.z.string()).default([]),
    rootFiles: zod_1.z.array(zod_1.z.string()).default([]),
    env: zod_1.z.record(zod_1.z.string()).optional(),
    enabled: zod_1.z.boolean().default(true),
    diagnosticsLimit: zod_1.z.number().int().positive().optional(),
});
exports.LspConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(true),
    autoStart: zod_1.z.boolean().default(true),
    diagnosticsLimit: zod_1.z.number().int().positive().default(200),
    servers: zod_1.z.record(exports.LspServerConfigSchema).default({}),
});
exports.DEFAULT_LSP_CONFIG = {
    enabled: true,
    autoStart: true,
    diagnosticsLimit: 200,
    servers: {},
};
async function loadLspConfig(workspaceRoot, configPath = path_1.default.join(workspaceRoot, '.chimera', 'config.yaml')) {
    try {
        const raw = await fs_1.promises.readFile(configPath, 'utf-8');
        const parsed = yaml_1.default.parse(raw);
        const value = parsed?.lsp ?? parsed ?? {};
        return exports.LspConfigSchema.parse(value);
    }
    catch (err) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
            return exports.DEFAULT_LSP_CONFIG;
        }
        throw err;
    }
}
function mergeLspConfig(base, override) {
    return exports.LspConfigSchema.parse({
        ...base,
        ...override,
        servers: {
            ...base.servers,
            ...(override?.servers ?? {}),
        },
    });
}
//# sourceMappingURL=config.js.map