import { describe, it, expect } from 'vitest';
import path from 'path';
import { pathToUri, uriToPath, toAbsolutePath, relativePath } from '../uri.js';

const isWin = process.platform === 'win32';

describe('pathToUri', () => {
  it('converts absolute path to file URI', () => {
    const uri = pathToUri('/home/user/project/file.ts', '/home/user/project');
    expect(uri).toMatch(/^file:\/\//);
    expect(uri).toContain('file.ts');
  });

  it('converts relative path to file URI', () => {
    const uri = pathToUri('src/file.ts', '/home/user/project');
    expect(uri).toMatch(/^file:\/\//);
    expect(uri).toContain('file.ts');
  });

  it('handles Windows paths', () => {
    const uri = pathToUri('C:\\Users\\project\\file.ts', 'C:\\Users\\project');
    expect(uri).toMatch(/^file:\/\//);
  });
});

describe('uriToPath', () => {
  it('converts file URI to path', () => {
    const filePath = uriToPath('file:///home/user/project/file.ts');
    expect(filePath).toContain('file.ts');
  });

  it('handles encoded characters in URI', () => {
    const filePath = uriToPath('file:///home/user/my%20project/file.ts');
    expect(filePath).toContain('file.ts');
  });
});

describe('toAbsolutePath', () => {
  it('returns absolute paths unchanged', () => {
    const result = toAbsolutePath('/home/user/file.ts', '/home/user');
    expect(result).toBe('/home/user/file.ts');
  });

  it('resolves relative paths against workspace root', () => {
    const result = toAbsolutePath('src/file.ts', '/home/user/project');
    expect(result).toContain('file.ts');
    // Verify it's an absolute path
    expect(path.isAbsolute(result)).toBe(true);
  });

  it('passes through file URIs', () => {
    const result = toAbsolutePath('file:///home/user/file.ts', '/home/user');
    expect(result).toContain('file.ts');
  });

  it('handles Windows absolute paths', () => {
    const result = toAbsolutePath('C:\\Users\\file.ts', 'C:\\Users');
    expect(result).toBe('C:\\Users\\file.ts');
  });
});

describe('relativePath', () => {
  it('returns relative path from workspace root', () => {
    const result = relativePath('/home/user/project/src/file.ts', '/home/user/project');
    // Normalize for platform (Windows uses backslash)
    expect(result).toBe(path.join('src', 'file.ts'));
  });

  it('returns "." for workspace root itself', () => {
    const result = relativePath('/home/user/project', '/home/user/project');
    expect(result).toBe('.');
  });

  it('handles deeply nested paths', () => {
    const result = relativePath('/home/user/project/a/b/c/file.ts', '/home/user/project');
    expect(result).toBe(path.join('a', 'b', 'c', 'file.ts'));
  });
});
