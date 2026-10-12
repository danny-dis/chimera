import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VerificationController } from '../services/verification-controller.js';

it.each([
  { output: 'dist', added: 'dist/out.cjs', pass: true },
  { output: 'dist', added: 'src/injected.cjs', pass: false },
  { output: '.', added: 'dist/out.cjs', pass: false },
  { output: '../outside', added: 'dist/out.cjs', pass: false },
])('keeps generated output declarations bounded: $output / $added', async ({ output, added, pass }) => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-output-scope-'));
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/input.cjs'), 'module.exports = 7;');
    const result = await new VerificationController().runCommandChecks({
      runId: 'scope-test', workspaceRoot: root, mode: 'code', commands: ['check'], generatedOutputs: [output],
      registry: { has: name => name === 'run_shell_command', getAll: () => [] },
      executor: { execute: async () => {
        mkdirSync(join(root, 'dist'), { recursive: true });
        writeFileSync(join(root, added), 'module.exports = 7;');
        return { success: true, data: { exitCode: 0 }, duration: 0 };
      } },
    });
    expect(result.verified).toBe(pass);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
