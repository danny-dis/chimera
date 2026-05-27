import { describe, it, expect } from 'vitest';
import {
  PermissionEngine,
  readOnlyProfile,
  editFilesProfile,
  fullAccessProfile,
  customProfile,
} from '../permission/policy.js';

describe('PermissionEngine', () => {
  describe('readOnly profile', () => {
    it('allows read operations', () => {
      const engine = new PermissionEngine(readOnlyProfile);
      expect(engine.check('read_file', {})).toBe('allow');
      expect(engine.check('search_files', {})).toBe('allow');
      expect(engine.check('glob_files', {})).toBe('allow');
      expect(engine.check('git_status', {})).toBe('allow');
      expect(engine.check('git_diff', {})).toBe('allow');
      expect(engine.check('git_log', {})).toBe('allow');
    });

    it('denies write operations', () => {
      const engine = new PermissionEngine(readOnlyProfile);
      expect(engine.check('write_file', {})).toBe('deny');
      expect(engine.check('edit_file', {})).toBe('deny');
      expect(engine.check('shell_exec', {})).toBe('deny');
    });
  });

  describe('editFiles profile', () => {
    it('allows read and write operations', () => {
      const engine = new PermissionEngine(editFilesProfile);
      expect(engine.check('read_file', {})).toBe('allow');
      expect(engine.check('write_file', {})).toBe('allow');
      expect(engine.check('edit_file', {})).toBe('allow');
      expect(engine.check('git_status', {})).toBe('allow');
    });

    it('denies shell operations', () => {
      const engine = new PermissionEngine(editFilesProfile);
      expect(engine.check('shell_exec', {})).toBe('deny');
      expect(engine.check('shell_run', {})).toBe('deny');
    });
  });

  describe('fullAccess profile', () => {
    it('allows all tools', () => {
      const engine = new PermissionEngine(fullAccessProfile);
      expect(engine.check('read_file', {})).toBe('allow');
      expect(engine.check('write_file', {})).toBe('allow');
      expect(engine.check('shell_exec', {})).toBe('allow');
      expect(engine.check('anything', {})).toBe('allow');
    });
  });

  describe('custom profile', () => {
    it('asks for unknown tools', () => {
      const engine = new PermissionEngine(customProfile);
      expect(engine.check('read_file', {})).toBe('ask');
      expect(engine.check('unknown_tool', {})).toBe('ask');
    });

    it('respects added rules', () => {
      const engine = new PermissionEngine(customProfile);
      engine.addRule({ toolPattern: 'read_*', decision: 'allow' });
      engine.addRule({ toolPattern: 'write_*', decision: 'deny' });

      expect(engine.check('read_file', {})).toBe('allow');
      expect(engine.check('read_dir', {})).toBe('allow');
      expect(engine.check('write_file', {})).toBe('deny');
    });
  });

  describe('setMode', () => {
    it('switches to readOnly mode', () => {
      const engine = new PermissionEngine(customProfile);
      engine.setMode('readOnly');
      expect(engine.getMode()).toBe('readOnly');
      expect(engine.check('read_file', {})).toBe('allow');
      expect(engine.check('write_file', {})).toBe('deny');
    });

    it('switches to fullAccess mode', () => {
      const engine = new PermissionEngine(readOnlyProfile);
      engine.setMode('fullAccess');
      expect(engine.getMode()).toBe('fullAccess');
      expect(engine.check('shell_exec', {})).toBe('allow');
    });
  });

  describe('addRule and removeRule', () => {
    it('adds and removes rules', () => {
      const engine = new PermissionEngine(customProfile);
      engine.addRule({ toolPattern: 'test_*', decision: 'allow' });
      expect(engine.check('test_run', {})).toBe('allow');

      engine.removeRule('test_*');
      expect(engine.check('test_run', {})).toBe('ask');
    });

    it('updates existing rule', () => {
      const engine = new PermissionEngine(customProfile);
      engine.addRule({ toolPattern: 'shell_*', decision: 'allow' });
      expect(engine.check('shell_exec', {})).toBe('allow');

      engine.addRule({ toolPattern: 'shell_*', decision: 'deny' });
      expect(engine.check('shell_exec', {})).toBe('deny');
    });
  });

  describe('condition matching', () => {
    it('evaluates path conditions', () => {
      const engine = new PermissionEngine(customProfile);
      engine.addRule({
        toolPattern: 'read_file',
        decision: 'ask',
        conditions: [
          { type: 'path', match: '^/tmp/', action: 'allow' },
        ],
      });

      expect(engine.check('read_file', { path: '/tmp/test.txt' })).toBe('allow');
      expect(engine.check('read_file', { path: '/etc/passwd' })).toBe('ask');
    });

    it('evaluates command conditions', () => {
      const engine = new PermissionEngine(customProfile);
      engine.addRule({
        toolPattern: 'shell_exec',
        decision: 'deny',
        conditions: [
          { type: 'command', match: '^ls', action: 'allow' },
        ],
      });

      expect(engine.check('shell_exec', { command: 'ls -la' })).toBe('allow');
      expect(engine.check('shell_exec', { command: 'rm -rf /' })).toBe('deny');
    });
  });

  describe('glob pattern matching', () => {
    it('matches wildcard patterns', () => {
      const engine = new PermissionEngine(customProfile);
      engine.addRule({ toolPattern: 'git_*', decision: 'allow' });

      expect(engine.check('git_status', {})).toBe('allow');
      expect(engine.check('git_diff', {})).toBe('allow');
      expect(engine.check('git_log', {})).toBe('allow');
      expect(engine.check('git_commit', {})).toBe('allow');
    });

    it('matches exact patterns', () => {
      const engine = new PermissionEngine(customProfile);
      engine.addRule({ toolPattern: 'read_file', decision: 'allow' });

      expect(engine.check('read_file', {})).toBe('allow');
      expect(engine.check('read_dir', {})).toBe('ask');
    });
  });
});
