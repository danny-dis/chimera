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

      const result = await sandbox.execute('echo error >&2');
      expect(result.stderr).toBe('error');
      expect(result.exitCode).toBe(0);

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

      const result = await sandbox.execute('echo $MY_VAR', {
        env: { MY_VAR: 'test_value' },
      });
      expect(result.stdout).toBe('test_value');

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
});
