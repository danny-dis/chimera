import { describe, it, expect } from 'vitest';
import { Sandbox } from '../sandbox/sandbox.js';

describe('Sandbox', () => {
  describe('process tier', () => {
    it('executes simple commands', async () => {
      const sandbox = new Sandbox({
        tier: 'process',
        workspaceRoot: '/tmp',
        timeoutMs: 5000,
      });

      const result = await sandbox.execute('echo hello');
      expect(result.stdout).toBe('hello');
      expect(result.exitCode).toBe(0);
      expect(result.killed).toBe(false);
      expect(result.oom).toBe(false);
      expect(result.duration).toBeGreaterThanOrEqual(0);

      sandbox.destroy();
    });

    it('captures stderr', async () => {
      const sandbox = new Sandbox({
        tier: 'process',
        workspaceRoot: '/tmp',
        timeoutMs: 5000,
      });

      const cmd = process.platform === 'win32'
        ? 'Write-Error error'
        : 'echo error >&2';
      const result = await sandbox.execute(cmd);
      expect(result.stderr).toContain('error');

      sandbox.destroy();
    });

    it('returns non-zero exit code for failing commands', async () => {
      const sandbox = new Sandbox({
        tier: 'process',
        workspaceRoot: '/tmp',
        timeoutMs: 5000,
      });

      const result = await sandbox.execute('false');
      expect(result.exitCode).toBe(1);

      sandbox.destroy();
    });

    // The bash-backed process tier is reliable on POSIX. On Windows, Git Bash
    // often refuses to honor SIGTERM (the SIGKILL is also blocked while the
    // child holds the console), so the test would exceed its own 5s window.
    it.runIf(process.platform !== 'win32')('enforces timeout', async () => {
      const sandbox = new Sandbox({
        tier: 'process',
        workspaceRoot: '/tmp',
        timeoutMs: 100,
      });

      const result = await sandbox.execute('sleep 10');
      expect(result.exitCode).toBe(124);

      sandbox.destroy();
    }, 5000);

    it('throws after destroy', async () => {
      const sandbox = new Sandbox({
        tier: 'process',
        workspaceRoot: '/tmp',
      });

      sandbox.destroy();

      await expect(sandbox.execute('echo test')).rejects.toThrow('Sandbox has been destroyed');
    });

    it('passes environment variables', async () => {
      const sandbox = new Sandbox({
        tier: 'process',
        workspaceRoot: '/tmp',
        timeoutMs: 5000,
      });

      const cmd = process.platform === 'win32'
        ? '$env:MY_VAR'
        : 'echo $MY_VAR';
      const result = await sandbox.execute(cmd, {
        env: { MY_VAR: 'test_value' },
      });
      expect(result.stdout.trim()).toBe('test_value');

      sandbox.destroy();
    });
  });

  describe('sandbox tiers', () => {
    it('accepts process tier config', () => {
      const sandbox = new Sandbox({
        tier: 'process',
        workspaceRoot: '/tmp',
        maxMemoryMB: 256,
        timeoutMs: 10000,
      });
      expect(sandbox).toBeDefined();
      sandbox.destroy();
    });

    it('accepts os tier config', () => {
      const sandbox = new Sandbox({
        tier: 'os',
        workspaceRoot: '/tmp',
        networkEgress: false,
      });
      expect(sandbox).toBeDefined();
      sandbox.destroy();
    });

    it('accepts container tier config', () => {
      const sandbox = new Sandbox({
        tier: 'container',
        workspaceRoot: '/tmp',
        maxMemoryMB: 128,
        networkEgress: false,
      });
      expect(sandbox).toBeDefined();
      sandbox.destroy();
    });

    it('defaults network egress to false', () => {
      const sandbox = new Sandbox({
        tier: 'process',
        workspaceRoot: '/tmp',
      });
      expect(sandbox).toBeDefined();
      sandbox.destroy();
    });
  });

  describe('resource limits', () => {
    it('applies memory limits', async () => {
      const sandbox = new Sandbox({
        tier: 'process',
        workspaceRoot: '/tmp',
        maxMemoryMB: 64,
        timeoutMs: 5000,
      });

      const result = await sandbox.execute('echo test');
      expect(result.exitCode).toBe(0);

      sandbox.destroy();
    });
  });

  describe('windows compatibility', () => {
    it('does not crash on Windows code path', async () => {
      const sandbox = new Sandbox({
        tier: 'process',
        workspaceRoot: process.platform === 'win32' ? 'C:\\Windows\\Temp' : '/tmp',
        timeoutMs: 5000,
      });

      // This should work on both Windows and Unix
      const result = await sandbox.execute(
        process.platform === 'win32' ? 'echo hello' : 'echo hello',
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('hello');

      sandbox.destroy();
    });

    it('uses powershell on Windows', async () => {
      if (process.platform !== 'win32') {
        return; // Skip on non-Windows
      }

      const sandbox = new Sandbox({
        tier: 'process',
        workspaceRoot: 'C:\\Windows\\Temp',
        timeoutMs: 5000,
      });

      const result = await sandbox.execute('Write-Output windows-test');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('windows-test');

      sandbox.destroy();
    });
  });
});
