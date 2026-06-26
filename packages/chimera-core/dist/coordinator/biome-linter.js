"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BiomeLinter = void 0;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_os_1 = require("node:os");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
const DEFAULT_CONFIG = {
    timeoutMs: 15_000,
};
let tmpDir;
async function getTmpDir() {
    if (!tmpDir) {
        tmpDir = (0, node_path_1.join)((0, node_os_1.tmpdir)(), 'chimera-lint');
        await (0, promises_1.mkdir)(tmpDir, { recursive: true });
    }
    return tmpDir;
}
function findBiomeBinary() {
    const isWin = process.platform === 'win32';
    const binName = isWin ? 'biome.CMD' : 'biome';
    const pkgDir = (0, node_path_1.resolve)(__dirname, '..', '..');
    const candidates = [
        (0, node_path_1.join)(pkgDir, 'node_modules', '.bin', binName),
        (0, node_path_1.join)(pkgDir, 'node_modules', '.bin', 'biome.cmd'),
    ];
    for (const c of candidates) {
        if ((0, node_fs_1.existsSync)(c))
            return c;
    }
    return isWin ? 'biome.cmd' : 'biome';
}
class BiomeLinter {
    config;
    binary;
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.binary = findBiomeBinary();
    }
    async lintCode(code, filename = 'check.ts') {
        const start = Date.now();
        const dir = await getTmpDir();
        const ext = filename.endsWith('.tsx') ? '.tsx' : '.ts';
        const tmpFile = (0, node_path_1.join)(dir, `${(0, node_crypto_1.randomBytes)(8).toString('hex')}${ext}`);
        try {
            await (0, promises_1.writeFile)(tmpFile, code, 'utf-8');
            const args = [this.binary, 'lint', tmpFile];
            if (this.config.configPath) {
                args.push('--config-path', this.config.configPath);
            }
            const { stdout, stderr } = await execAsync(args.join(' '), {
                timeout: this.config.timeoutMs,
                maxBuffer: 1024 * 1024,
            });
            return { ...this.parseOutput((stdout ?? '') + '\n' + (stderr ?? '')), durationMs: Date.now() - start };
        }
        catch (err) {
            return { ...this.parseOutput((err.stdout ?? '') + '\n' + (err.stderr ?? '')), durationMs: Date.now() - start };
        }
        finally {
            await (0, promises_1.unlink)(tmpFile).catch(() => { });
        }
    }
    async lintFile(filePath) {
        const start = Date.now();
        try {
            const args = [this.binary, 'lint', filePath];
            if (this.config.configPath) {
                args.push('--config-path', this.config.configPath);
            }
            const { stdout, stderr } = await execAsync(args.join(' '), {
                timeout: this.config.timeoutMs,
                maxBuffer: 1024 * 1024,
            });
            return { ...this.parseOutput((stdout ?? '') + '\n' + (stderr ?? '')), durationMs: Date.now() - start };
        }
        catch (err) {
            return { ...this.parseOutput((err.stdout ?? '') + '\n' + (err.stderr ?? '')), durationMs: Date.now() - start };
        }
    }
    parseOutput(raw) {
        const diagnostics = [];
        const errors = [];
        const warnings = [];
        const lines = raw.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('Checked') || trimmed.startsWith('Found') || trimmed.startsWith('No fixes') || trimmed.startsWith('lint ━━')) {
                continue;
            }
            const errorMatch = trimmed.match(/^×\s+(.+)/);
            if (errorMatch) {
                const msg = errorMatch[1];
                if (msg.includes("contents aren't fixed") || msg.includes('configuration') || msg.includes('Some errors'))
                    continue;
                errors.push(msg);
                diagnostics.push({ message: msg, severity: 'error' });
                continue;
            }
            const warnMatch = trimmed.match(/^!\s+(.+)/);
            if (warnMatch) {
                const msg = warnMatch[1];
                warnings.push(msg);
                diagnostics.push({ message: msg, severity: 'warning' });
                continue;
            }
            const diagMatch = trimmed.match(/^(.+?):(\d+):(\d+)\s+\S+\s━+/);
            if (diagMatch) {
                const filePath = diagMatch[1];
                const lineNum = parseInt(diagMatch[2], 10);
                const colNum = parseInt(diagMatch[3], 10);
                const ruleMatch = trimmed.match(/lint\/(\w+)\/(\w+)/);
                const rule = ruleMatch ? ruleMatch[2] : undefined;
                diagnostics.push({
                    message: trimmed,
                    severity: errors.length > 0 ? 'error' : 'warning',
                    file: filePath,
                    line: lineNum,
                    column: colNum,
                    rule,
                });
            }
        }
        return {
            passed: errors.length === 0,
            errors,
            warnings,
            diagnostics,
        };
    }
}
exports.BiomeLinter = BiomeLinter;
//# sourceMappingURL=biome-linter.js.map