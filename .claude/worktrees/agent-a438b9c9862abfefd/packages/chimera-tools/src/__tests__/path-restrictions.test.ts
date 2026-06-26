import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { PathRestrictionEngine } from '../permission/path-restrictions.js';

describe('PathRestrictionEngine', () => {
  // Use a workspace root expressed as a forward-slash string; resolve it through
  // Node's path module so the test is portable to both POSIX and Windows.
  const workspaceRoot = path.resolve('/home/user/project');
  const outsideAbsolute = path.resolve('/etc/passwd');
  const insideAbsolute = path.join(workspaceRoot, 'src/index.ts');

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

      // Sibling of workspace — guaranteed to be outside, on both POSIX and Windows.
      const outsideDir = path.resolve(workspaceRoot, '..', 'other-project');
      expect(engine.isPathAllowed(path.join(outsideDir, 'secret.txt'))).toBe(false);
      // Different drive letter on Windows, or root-only on POSIX.
      const otherDrive = path.sep === '\\' ? 'D:\\foo\\bar.txt' : '/var/log/app.log';
      expect(engine.isPathAllowed(otherDrive)).toBe(false);
    });

    it('allows absolute paths within workspace', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);

      expect(engine.isPathAllowed(insideAbsolute)).toBe(true);
      expect(engine.isPathAllowed(path.join(workspaceRoot, 'README.md'))).toBe(true);
    });
  });

  describe('path resolution', () => {
    it('resolves relative paths within workspace', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);

      expect(engine.resolvePath('src/index.ts')).toBe(path.join(workspaceRoot, 'src/index.ts'));
      expect(engine.resolvePath('./file.txt')).toBe(path.join(workspaceRoot, 'file.txt'));
    });

    it('normalizes absolute paths', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);

      const traversal = path.join(workspaceRoot, 'src', '..', 'src', 'index.ts');
      expect(engine.resolvePath(traversal)).toBe(path.join(workspaceRoot, 'src/index.ts'));
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
      const violation = engine.getViolation(outsideAbsolute);

      expect(violation).not.toBeNull();
      expect(violation).toContain('outside workspace');
    });

    it('returns null for valid paths', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);

      expect(engine.getViolation('src/index.ts')).toBeNull();
      expect(engine.getViolation(path.join(workspaceRoot, 'file.txt'))).toBeNull();
    });
  });

  describe('allowed patterns', () => {
    it('allows paths matching exception patterns', () => {
      // On POSIX the separator is '/', on Windows it's '\\'. Build a regex
      // that anchors on the separator at the start of an absolute path.
      const sep = path.sep.replace(/\\/g, '\\\\');
      const engine = new PathRestrictionEngine(workspaceRoot, [`^${sep}tmp${sep}`]);

      expect(engine.isPathAllowed(`${path.sep}tmp${path.sep}test.txt`)).toBe(true);
      expect(engine.isPathAllowed(outsideAbsolute)).toBe(false);
    });

    it('allows multiple exception patterns', () => {
      const sep = path.sep.replace(/\\/g, '\\\\');
      const engine = new PathRestrictionEngine(workspaceRoot, [
        `^${sep}tmp${sep}`,
        `^${sep}var${sep}log${sep}`,
      ]);

      expect(engine.isPathAllowed(`${path.sep}tmp${path.sep}cache`)).toBe(true);
      expect(engine.isPathAllowed(`${path.sep}var${path.sep}log${path.sep}app.log`)).toBe(true);
      expect(engine.isPathAllowed(outsideAbsolute)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty path', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);
      expect(engine.isPathAllowed('')).toBe(true);
    });

    it('handles root workspace path', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);
      expect(engine.isPathAllowed(workspaceRoot)).toBe(true);
    });

    it('handles dot files', () => {
      const engine = new PathRestrictionEngine(workspaceRoot);
      expect(engine.isPathAllowed('.gitignore')).toBe(true);
      expect(engine.isPathAllowed('.env')).toBe(true);
    });
  });
});
