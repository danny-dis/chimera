import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import { PTYExecutor } from '../sandbox/pty-executor.js';

const isWin = process.platform === 'win32';
const tmpDir = os.tmpdir();

describe('PTYExecutor', () => {
  describe('command execution', () => {
    it('executes simple commands', async () => {
      const executor = new PTYExecutor({
        workspaceRoot: tmpDir,
        defaultTimeout: 5000,
      });

      const result = await executor.execute({
        command: isWin ? 'echo hello' : 'echo hello',
        cwd: tmpDir,
        timeout: 5000,
        env: {},
      });

      expect(result.stdout.trim()).toBe('hello');
      expect(result.exitCode).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('captures stderr', async () => {
      const executor = new PTYExecutor({
        workspaceRoot: tmpDir,
        defaultTimeout: 5000,
      });

      const result = await executor.execute({
        command: isWin ? 'node -e "process.stderr.write(\'error\')"' : 'echo error >&2',
        cwd: tmpDir,
        timeout: 5000,
        env: {},
      });

      expect(result.stderr.trim()).toBe('error');
      expect(result.exitCode).toBe(0);
    });

    it('returns non-zero exit code', async () => {
      const executor = new PTYExecutor({
        workspaceRoot: tmpDir,
        defaultTimeout: 5000,
      });

      const result = await executor.execute({
        command: isWin ? 'exit /b 42' : 'exit 42',
        cwd: tmpDir,
        timeout: 5000,
        env: {},
      });

      expect(result.exitCode).toBe(42);
    });
  });

  describe('timeout enforcement', () => {
    it('kills process after timeout', async () => {
      const executor = new PTYExecutor({
        workspaceRoot: tmpDir,
        defaultTimeout: 100,
      });

      const result = await executor.execute({
        command: isWin ? 'node -e "setTimeout(()=>{},10000)"' : 'sleep 10',
        cwd: tmpDir,
        timeout: 100,
        env: {},
      });

      expect(result.duration).toBeGreaterThanOrEqual(0);
    }, 5000);
  });

  describe('output truncation', () => {
    it('truncates large output', async () => {
      const executor = new PTYExecutor({
        workspaceRoot: tmpDir,
        defaultTimeout: 5000,
      });

      const result = await executor.execute({
        command: `node -e "process.stdout.write('a'.repeat(5000))"`,
        cwd: tmpDir,
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
        workspaceRoot: path.join(tmpDir, 'workspace'),
        defaultTimeout: 5000,
      });

      const outsideDir = isWin ? 'C:\\Windows\\Temp\\outside' : '/tmp/outside';

      await expect(
        executor.execute({
          command: 'echo test',
          cwd: outsideDir,
          timeout: 5000,
          env: {},
        }),
      ).rejects.toThrow('outside workspace');
    });
  });

  describe('environment variables', () => {
    it('passes environment variables', async () => {
      const executor = new PTYExecutor({
        workspaceRoot: tmpDir,
        defaultTimeout: 5000,
      });

      const result = await executor.execute({
        command: isWin
          ? 'node -e "process.stdout.write(process.env.MY_TEST_VAR || \'\')"'
          : 'echo $MY_TEST_VAR',
        cwd: tmpDir,
        timeout: 5000,
        env: { MY_TEST_VAR: 'test_value' },
      });

      expect(result.stdout.trim()).toBe('test_value');
    });
  });

  describe('kill', () => {
    it('kills running process', async () => {
      const executor = new PTYExecutor({
        workspaceRoot: tmpDir,
        defaultTimeout: 5000,
      });

      const promise = executor.execute({
        command: isWin ? 'node -e "setTimeout(()=>{},10000)"' : 'sleep 10',
        cwd: tmpDir,
        timeout: 10000,
        env: {},
      });

      executor.kill();

      const result = await promise;
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
