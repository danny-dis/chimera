"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runShellCommandTool = void 0;
const zod_1 = require("zod");
const execa_1 = require("execa");
const path_1 = __importDefault(require("path"));
const tool_schema_js_1 = require("../tool-schema.js");
// ── Dangerous command patterns ───────────────────────────────────────────────
const DANGEROUS_PATTERNS = [
    /^\s*rm\s+(-rf?|--force)\s+\/\s*$/,
    /^\s*rm\s+(-rf?|--force)\s+\/\s*;/,
    /^\s*rm\s+(-rf?|--force)\s+\/\s*\|/,
    /^\s*>\s*\/dev\/(sda|sdb|sdc)/,
    /^\s*dd\s+.*of=\/dev\/sd/,
    /^\s*mkfs/,
    /^\s*:\(\)\{\s*:\|:\s*&\s*\}\s*;/, // fork bomb
    /^\s*chmod\s+777\s+\/\s*$/,
    /^\s*chmod\s+-R\s+777\s+\/\s*$/,
    /^\s*sudo\s+rm\s+(-rf?|--force)\s+\/\s*$/,
    /^\s*mv\s+.*\/dev\/null/,
    /^\s*shred\s+/,
];
function isDangerous(command) {
    for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(command))
            return true;
    }
    return false;
}
function truncateOutput(output, limit = tool_schema_js_1.MAX_OUTPUT_SIZE) {
    if (Buffer.byteLength(output, 'utf-8') > limit) {
        return {
            text: output.substring(0, limit) + '\n... [output truncated]',
            truncated: true,
        };
    }
    return { text: output, truncated: false };
}
const SAFE_ENV_BLOCKLIST = [
    'AWS_SECRET_ACCESS_KEY',
    'AWS_ACCESS_KEY_ID',
    'GITHUB_TOKEN',
    'GH_TOKEN',
    'NPM_TOKEN',
    'PRIVATE_KEY',
    'DATABASE_URL',
    'API_KEY',
    'SECRET',
    'PASSWORD',
];
function filterEnv(env = {}) {
    const filtered = {};
    for (const [key, value] of Object.entries(env)) {
        const upper = key.toUpperCase();
        const blocked = SAFE_ENV_BLOCKLIST.some((blocked) => upper.includes(blocked));
        if (!blocked) {
            filtered[key] = value;
        }
    }
    return filtered;
}
// ── run_shell_command ────────────────────────────────────────────────────────
const RunShellCommandParamsSchema = zod_1.z.object({
    command: zod_1.z.string().min(1, 'Command must not be empty'),
    cwd: zod_1.z.string().optional(),
    timeout: zod_1.z.number().int().positive().default(tool_schema_js_1.DEFAULT_SHELL_TIMEOUT),
    env: zod_1.z.record(zod_1.z.string()).optional(),
});
const RunShellCommandReturnsSchema = zod_1.z.object({
    stdout: zod_1.z.string(),
    stderr: zod_1.z.string(),
    exitCode: zod_1.z.number(),
    duration: zod_1.z.number(),
});
exports.runShellCommandTool = {
    name: 'run_shell_command',
    description: 'Execute a shell command with timeout and output limits',
    parameters: RunShellCommandParamsSchema,
    returns: RunShellCommandReturnsSchema,
    category: 'shell',
    permissionLevel: 'execute',
    execute: async (params, context) => {
        if (isDangerous(params.command)) {
            throw new Error(`Command rejected as dangerous: ${params.command}`);
        }
        const timeout = Math.min(params.timeout, tool_schema_js_1.MAX_SHELL_TIMEOUT);
        const workingDir = params.cwd
            ? path_1.default.resolve(context.workspaceRoot, params.cwd)
            : context.workspaceRoot;
        if (!workingDir.startsWith(path_1.default.resolve(context.workspaceRoot))) {
            throw new Error(`Working directory escapes workspace root: ${params.cwd}`);
        }
        const filteredEnv = filterEnv(params.env);
        const startTime = Date.now();
        let result;
        try {
            const execResult = await (0, execa_1.execa)('bash', ['-c', params.command], {
                cwd: workingDir,
                timeout,
                maxBuffer: tool_schema_js_1.MAX_OUTPUT_SIZE,
                env: filteredEnv,
                reject: false,
            });
            result = {
                stdout: execResult.stdout,
                stderr: execResult.stderr,
                exitCode: execResult.exitCode ?? 0,
            };
        }
        catch (err) {
            const error = err;
            if (error.timedOut) {
                return {
                    stdout: '',
                    stderr: `Command timed out after ${timeout}ms`,
                    exitCode: -1,
                    duration: timeout,
                };
            }
            result = {
                stdout: error.stdout ?? '',
                stderr: error.stderr ?? String(err),
                exitCode: error.exitCode ?? -1,
            };
        }
        const duration = Date.now() - startTime;
        const stdoutResult = truncateOutput(result.stdout);
        const stderrResult = truncateOutput(result.stderr);
        return {
            stdout: stdoutResult.text,
            stderr: stderrResult.text,
            exitCode: result.exitCode,
            duration,
        };
    },
};
//# sourceMappingURL=shell.js.map