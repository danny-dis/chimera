import { expect, it } from 'vitest';
import { VerificationController } from '../services/verification-controller.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
it('retains bounded failure diagnostics with secrets redacted for repair', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-check-feedback-'));
  try {
    const result = await new VerificationController().runCommandChecks({
      runId: 'diagnostic-test', commands: ['node verify.cjs'], workspaceRoot: root, mode: 'code',
      registry: { has: name => name === 'run_shell_command', getAll: () => [] },
      executor: { execute: async () => ({ success: true, data: { exitCode: 1,
        stderr: 'TypeError: add is not a function\npassword="unit-test-only-value-123456789"\n' + 'x'.repeat(5000) }, duration: 0 }) },
    });
    const diagnostic = result.bundle.evidences[0].data.diagnostic;
    expect(diagnostic).toContain('TypeError: add is not a function');
    expect(diagnostic).not.toContain('unit-test-only-value-123456789');
    expect(String(diagnostic).length).toBeLessThanOrEqual(2048);
    expect(result.verified).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
