import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { PathRestrictionEngine } from '../permission/path-restrictions.js';

describe('PathRestrictionEngine', () => {
  const workspaceRoot = '/home/user/project';

  describe('basic path checking', () => {
    it('allows paths within workspace', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);

      expect(engine.isPathAllowed('src/index.ts')).toBe(true);
      expect(engine.isPathAllowed('README.md')).toBe(true);
      expect(engine.isPathAllowed('src/utils/helpers.ts')).toBe(true);
    });

    it('rejects path traversal', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);

      expect(engine.isPathAllowed('../secret.txt')).toBe(false);
      expect(engine.isPathAllowed('../../etc/passwd')).toBe(false);
      expect(engine.isPathAllowed('src/../../../etc/passwd')).toBe(false);
    });

    it('rejects absolute paths outside workspace', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);

      expect(engine.isPathAllowed('/etc/passwd')).toBe(false);
      expect(engine.isPathAllowed('/tmp/test.txt')).toBe(false);
      expect(engine.isPathAllowed('/home/other/file.txt')).toBe(false);
    });

    it('allows absolute paths within workspace', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);

      expect(engine.isPathAllowed('/home/user/project/src/index.ts')).toBe(true);
      expect(engine.isPathAllowed('/home/user/project/README.md')).toBe(true);
    });
  });

  describe('path resolution', () => {
    it('resolves relative paths within workspace', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);

      expect(engine.resolvePath('src/index.ts')).toBe('/home/user/project/src/index.ts');
      expect(engine.resolvePath('./file.txt')).toBe('/home/user/project/file.txt');
    });

    it('normalizes absolute paths', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);

      expect(engine.resolvePath('/home/user/project/src/../src/index.ts')).toBe(
        '/home/user/project/src/index.ts',
      );
    });
  });

  describe('violation messages', () => {
    it('returns violation for path traversal', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);
      const violation = engine.getViolation('../etc/passwd');

      expect(violation).not.toBeNull();
      expect(violation).toContain('traversal');
    });

    it('returns violation for paths outside workspace', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);
      const violation = engine.getViolation('/etc/passwd');

      expect(violation).not.toBeNull();
      expect(violation).toContain('outside workspace');
    });

    it('returns null for valid paths', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);

      expect(engine.getViolation('src/index.ts')).toBeNull();
      expect(engine.getViolation('/home/user/project/file.txt')).toBeNull();
    });
  });

  describe('allowed patterns', () => {
    it('allows paths matching exception patterns', () => {
      const engine = new PathRestrictionEngine(workspaceRoot, ['^/tmp/']);

      expect(engine.isPathAllowed('/tmp/test.txt')).toBe(true);
      expect(engine.isPathAllowed('/etc/passwd')).toBe(false);
    });

    it('allows multiple exception patterns', () => {
      const engine = new PathRestrictionEngine(workspaceRoot, ['^/tmp/', '^/var/log/']);

      expect(engine.isPathAllowed('/tmp/cache')).toBe(true);
      expect(engine.isPathAllowed('/var/log/app.log')).toBe(true);
      expect(engine.isPathAllowed('/etc/passwd')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty path', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);
      expect(engine.isPathAllowed('')).toBe(true);
    });

    it('handles root workspace path', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);
      expect(engine.isPathAllowed('/home/user/project')).toBe(true);
    });

    it('handles dot files', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);
      expect(engine.isPathAllowed('.gitignore')).toBe(true);
      expect(engine.isPathAllowed('.env')).toBe(true);
    });
  });
});
