import { expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VerificationController } from '../services/verification-controller.js';

it('snapshots caller commands and output declarations before executor admission', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-check-contract-'));
  const commands = ['first', 'required'];
  const generatedOutputs: string[] = [];
  const execute = vi.fn(async () => {
    if (execute.mock.calls.length === 1) {
      commands.splice(1);
      generatedOutputs.push('src');
      mkdirSync(join(root, 'src'));
      writeFileSync(join(root, 'src/injected.cjs'), 'module.exports = 0;');
    }
    return { success: true, data: { exitCode: 0 }, duration: 0 };
  });
  try {
    const result = await new VerificationController().runCommandChecks({
      runId: 'contract-test', commands, generatedOutputs, workspaceRoot: root, mode: 'code',
      registry: { has: name => name === 'shell', getAll: () => [] }, executor: { execute },
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/stale/);
    expect(execute).toHaveBeenCalledTimes(1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it.each([0, 1])('detects verifier changes after each command even on exit %s', async exitCode => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-check-verifier-'));
  const verifier = join(root, 'verify.cjs');
  writeFileSync(verifier, 'original verifier');
  const execute = vi.fn(async () => {
    writeFileSync(verifier, execute.mock.calls.length === 1 ? 'weakened verifier' : 'original verifier');
    return { success: true, data: { exitCode }, duration: 0 };
  });
  try {
    const result = await new VerificationController().runCommandChecks({
      runId: 'verifier-test', commands: ['first', 'second'], workspaceRoot: root, mode: 'code',
      registry: { has: name => name === 'shell', getAll: () => [] }, executor: { execute },
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/stale/);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.bundle.evidences[0].data.exitCode).toBe(exitCode);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('runs every snapshotted caller command despite mutation of the original array', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-check-commands-'));
  const commands = ['first', 'required'];
  const execute = vi.fn(async () => {
    commands.splice(1);
    return { success: true, data: { exitCode: 0 }, duration: 0 };
  });
  try {
    const result = await new VerificationController().runCommandChecks({
      runId: 'commands-test', commands, workspaceRoot: root, mode: 'code',
      registry: { has: name => name === 'shell', getAll: () => [] }, executor: { execute },
    });
    expect(result.verified).toBe(true);
    expect(execute.mock.calls.map(call => (call as any)[1].command)).toEqual(['first', 'required']);
    expect(result.bundle.summary.passed).toBe(2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
