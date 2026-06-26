import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

const execAsync = promisify(exec);

export interface LintDiagnostic {
  message: string;
  severity: 'error' | 'warning' | 'info';
  file?: string;
  line?: number;
  column?: number;
  rule?: string;
}

export interface LintResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  diagnostics: LintDiagnostic[];
  durationMs: number;
}

export interface BiomeLinterConfig {
  timeoutMs?: number;
  configPath?: string;
}

const DEFAULT_CONFIG: BiomeLinterConfig = {
  timeoutMs: 15_000,
};

let tmpDir: string | undefined;

async function getTmpDir(): Promise<string> {
  if (!tmpDir) {
    tmpDir = join(tmpdir(), 'chimera-lint');
    await mkdir(tmpDir, { recursive: true });
  }
  return tmpDir;
}

function findBiomeBinary(): string {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'biome.CMD' : 'biome';

  const pkgDir = resolve(__dirname, '..', '..');
  const candidates = [
    join(pkgDir, 'node_modules', '.bin', binName),
    join(pkgDir, 'node_modules', '.bin', 'biome.cmd'),
  ];

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  return isWin ? 'biome.cmd' : 'biome';
}

export class BiomeLinter {
  private config: BiomeLinterConfig;
  private binary: string;

  constructor(config?: BiomeLinterConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.binary = findBiomeBinary();
  }

  async lintCode(code: string, filename = 'check.ts'): Promise<LintResult> {
    const start = Date.now();
    const dir = await getTmpDir();
    const ext = filename.endsWith('.tsx') ? '.tsx' : '.ts';
    const tmpFile = join(dir, `${randomBytes(8).toString('hex')}${ext}`);

    try {
      await writeFile(tmpFile, code, 'utf-8');
      const args = [this.binary, 'lint', tmpFile];
      if (this.config.configPath) {
        args.push('--config-path', this.config.configPath);
      }
      const { stdout, stderr } = await execAsync(args.join(' '), {
        timeout: this.config.timeoutMs,
        maxBuffer: 1024 * 1024,
      });
      return { ...this.parseOutput((stdout ?? '') + '\n' + (stderr ?? '')), durationMs: Date.now() - start };
    } catch (err: any) {
      return { ...this.parseOutput((err.stdout ?? '') + '\n' + (err.stderr ?? '')), durationMs: Date.now() - start };
    } finally {
      await unlink(tmpFile).catch(() => {});
    }
  }

  async lintFile(filePath: string): Promise<LintResult> {
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
    } catch (err: any) {
      return { ...this.parseOutput((err.stdout ?? '') + '\n' + (err.stderr ?? '')), durationMs: Date.now() - start };
    }
  }

  private parseOutput(raw: string): Omit<LintResult, 'durationMs'> {
    const diagnostics: LintDiagnostic[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    const lines = raw.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('Checked') || trimmed.startsWith('Found') || trimmed.startsWith('No fixes') || trimmed.startsWith('lint ━━')) {
        continue;
      }

      const errorMatch = trimmed.match(/^×\s+(.+)/);
      if (errorMatch) {
        const msg = errorMatch[1];
        if (msg.includes("contents aren't fixed") || msg.includes('configuration') || msg.includes('Some errors')) continue;
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