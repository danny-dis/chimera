import { it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VerificationController } from '../services/verification-controller.js';

it('uses the production run_shell_command registration for caller checks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-check-tool-'));
  const execute = vi.fn().mockResolvedValue({ success: true, data: { exitCode: 0 }, duration: 1 });
  try {
    const result = await new VerificationController().runCommandChecks({
      runId: 'check-tool', commands: ['node --version'], executor: { execute },
      registry: { has: name => name === 'run_shell_command', getAll: () => [] },
      workspaceRoot: root, mode: 'code',
    });
    expect(result.verified).toBe(true);
    expect(execute).toHaveBeenCalledWith('run_shell_command', { command: 'node --version' },
      expect.objectContaining({ workspaceRoot: root, mode: 'code' }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
