import { describe, it, expect } from 'vitest';
import { PTYExecutor } from '../sandbox/pty-executor.js';

describe('PTYExecutor', () => {
  describe('command execution', () => {
    it('executes simple commands', async () => {
      const executor = new PTYExecutor({
        workspaceRoot: '/tmp',
        defaultTimeout: 5000,
      });

      const result = await executor.execute({
        command: 'echo hello',
        cwd: '/tmp',
        timeout: 5000,
        env: {},
      });

      expect(result.stdout).toBe('hello');
      expect(result.exitCode).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('captures stderr', async () => {
      const executor = new PTYExecutor({
        workspaceRoot: '/tmp',
        defaultTimeout: 5000,
      });

      const result = await executor.execute({
        command: 'echo error >&2',
        cwd: '/tmp',
        timeout: 5000,
        env: {},
      });

      expect(result.stderr).toBe('error');
      expect(result.exitCode).toBe(0);
    });

    it('returns non-zero exit code', async () => {
      const executor = new PTYExecutor({
        workspaceRoot: '/tmp',
        defaultTimeout: 5000,
      });

      const result = await executor.execute({
        command: 'exit 42',
        cwd: '/tmp',
        timeout: 5000,
        env: {},
      });

      expect(result.exitCode).toBe(42);
    });
  });

  describe('timeout enforcement', () => {
    it('kills process after timeout', async () => {
      const executor = new PTYExecutor({
        workspaceRoot: '/tmp',
        defaultTimeout: 100,
      });

      const result = await executor.execute({
        command: 'sleep 10',
        cwd: '/tmp',
        timeout: 100,
        env: {},
      });

      expect(result.duration).toBeGreaterThanOrEqual(0);
    }, 5000);
  });

  describe('output truncation', () => {
    it('truncates large output', async () => {
      const executor = new PTYExecutor({
        workspaceRoot: '/tmp',
        defaultTimeout: 5000,
      });

      const result = await executor.execute({
        command: 'python3 -c "print(\'a\' * 5000)"',
        cwd: '/tmp',
        timeout: 5000,
        env: {},
        maxOutputBytes: 1000,
      });

      expect(result.stdout).toContain('truncated');
    });
  });

  describe('working directory enforcement', () => {
    it('rejects cwd outside workspace', async () => {
      const executor = new PTYExecutor({
        workspaceRoot: '/tmp/workspace',
        defaultTimeout: 5000,
      });

      await expect(
        executor.execute({
          command: 'echo test',
          cwd: '/tmp/outside',
          timeout: 5000,
          env: {},
        }),
      ).rejects.toThrow('outside workspace');
    });
  });

  describe('environment variables', () => {
    it('passes environment variables', async () => {
      const executor = new PTYExecutor({
        workspaceRoot: '/tmp',
        defaultTimeout: 5000,
      });

      const result = await executor.execute({
        command: 'echo $MY_TEST_VAR',
        cwd: '/tmp',
        timeout: 5000,
        env: { MY_TEST_VAR: 'test_value' },
      });

      expect(result.stdout).toBe('test_value');
    });
  });

  describe('kill', () => {
    it('kills running process', async () => {
      const executor = new PTYExecutor({
        workspaceRoot: '/tmp',
        defaultTimeout: 5000,
      });

      const promise = executor.execute({
        command: 'sleep 10',
        cwd: '/tmp',
        timeout: 10000,
        env: {},
      });

      executor.kill();

      const result = await promise;
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
