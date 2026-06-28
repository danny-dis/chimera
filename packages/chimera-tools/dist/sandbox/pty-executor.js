"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PTYExecutor = void 0;
const zod_1 = require("zod");
const execa_1 = require("execa");
const node_path_1 = __importDefault(require("node:path"));
const PTYOptionsSchema = zod_1.z.object({
    command: zod_1.z.string(),
    cwd: zod_1.z.string(),
    timeout: zod_1.z.number(),
    env: zod_1.z.record(zod_1.z.string()),
    maxOutputBytes: zod_1.z.number().optional(),
});
class PTYExecutor {
    workspaceRoot;
    currentProcess = null;
    constructor(options) {
        this.workspaceRoot = node_path_1.default.resolve(options.workspaceRoot);
    }
    async execute(options) {
        const validated = PTYOptionsSchema.parse({
            ...options,
            maxOutputBytes: options.maxOutputBytes ?? 10 * 1024 * 1024,
        });
        const resolvedCwd = node_path_1.default.resolve(validated.cwd);
        const normalizedCwd = resolvedCwd.replace(/[/\\]$/, '');
        const normalizedRoot = this.workspaceRoot.replace(/[/\\]$/, '');
        if (!normalizedCwd.startsWith(normalizedRoot) && normalizedCwd !== normalizedRoot) {
            throw new Error(`Working directory ${resolvedCwd} is outside workspace ${this.workspaceRoot}`);
        }
        const maxOutputBytes = validated.maxOutputBytes ?? 10 * 1024 * 1024;
        const startTime = Date.now();
        const isWin = process.platform === 'win32';
        const shell = isWin ? 'cmd.exe' : 'bash';
        const shellArgs = isWin ? ['/c', validated.command] : ['-c', validated.command];
        this.currentProcess = (0, execa_1.execa)(shell, shellArgs, {
            cwd: resolvedCwd,
            timeout: validated.timeout,
            env: validated.env,
            reject: false,
            killSignal: 'SIGTERM',
            maxBuffer: maxOutputBytes + 1024,
            windowsHide: true,
        });
        try {
            const result = await this.currentProcess;
            const duration = Date.now() - startTime;
            const stdout = this.truncateOutput(String(result.stdout ?? ''), maxOutputBytes);
            const stderr = this.truncateOutput(String(result.stderr ?? ''), maxOutputBytes);
            return {
                stdout,
                stderr,
                exitCode: result.exitCode ?? 0,
                duration,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const execaError = error;
            const stdout = this.truncateOutput(execaError.stdout ?? '', maxOutputBytes);
            const stderr = this.truncateOutput(execaError.stderr ?? String(error), maxOutputBytes);
            const wasTruncated = (execaError.originalMessage?.includes('maxBuffer') ?? false)
                || Buffer.byteLength(execaError.stdout ?? '', 'utf8') >= maxOutputBytes;
            const finalStdout = wasTruncated && !stdout.includes('truncated')
                ? `${stdout}\n... [output truncated, exceeded ${maxOutputBytes} bytes]`
                : stdout;
            return {
                stdout: finalStdout,
                stderr,
                exitCode: execaError.exitCode ?? 1,
                duration,
            };
        }
        finally {
            this.currentProcess = null;
        }
    }
    kill() {
        if (this.currentProcess) {
            this.currentProcess.kill('SIGTERM');
            this.currentProcess = null;
        }
    }
    truncateOutput(output, maxBytes) {
        if (Buffer.byteLength(output, 'utf8') <= maxBytes) {
            return output;
        }
        const truncated = output.slice(0, maxBytes);
        const lastNewline = truncated.lastIndexOf('\n');
        return lastNewline > 0
            ? `${truncated.slice(0, lastNewline)}\n... [output truncated, exceeded ${maxBytes} bytes]`
            : `${truncated}\n... [output truncated, exceeded ${maxBytes} bytes]`;
    }
}
exports.PTYExecutor = PTYExecutor;
//# sourceMappingURL=pty-executor.js.map