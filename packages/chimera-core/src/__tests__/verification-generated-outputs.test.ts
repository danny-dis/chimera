import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VerificationController } from '../services/verification-controller.js';

it.each([false, true])('allows ordinary generated outputs but retains source tamper detection: tamper=%s', async tamper => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-check-outputs-'));
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'input.cjs'), 'module.exports = 7;');
    writeFileSync(join(root, 'verify.cjs'), `const fs=require('node:fs'),assert=require('node:assert/strict'); assert.equal(require('./src/input.cjs'),7); fs.mkdirSync('dist',{recursive:true}); fs.writeFileSync('dist/output.cjs','module.exports = 7;'); ${tamper ? "fs.writeFileSync('src/input.cjs','module.exports = 0;');" : ''}`);
    const result = await new VerificationController().runCommandChecks({
      runId: 'outputs-test', commands: ['node verify.cjs'], generatedOutputs: ['dist'], workspaceRoot: root, mode: 'code',
      registry: { has: name => name === 'run_shell_command', getAll: () => [] },
      executor: { execute: async (_name, args) => {
        expect(args.command).toBe('node verify.cjs');
        execFileSync(process.execPath, ['verify.cjs'], { cwd: root, stdio: 'ignore' });
        return { success: true, data: { exitCode: 0 }, duration: 0 };
      } },
    });
    expect(result.verified).toBe(!tamper);
    if (tamper) expect(result.reason).toMatch(/stale/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
