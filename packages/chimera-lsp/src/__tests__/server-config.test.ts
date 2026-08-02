import { describe, it, expect } from 'vitest';
import { serverMatchesFile, matchesRootFiles, matchesPattern } from '../server-config.js';
import type { LspServerConfig } from '../types.js';

describe('matchesPattern', () => {
  it('matches exact file names', () => {
    expect(matchesPattern('file.ts', 'file.ts')).toBe(true);
    expect(matchesPattern('other.ts', 'file.ts')).toBe(false);
  });

  it('matches wildcard patterns', () => {
    expect(matchesPattern('src/file.ts', '**/*.ts')).toBe(true);
    expect(matchesPattern('file.js', '**/*.ts')).toBe(false);
  });

  it('matches **/ with zero directories (root-level files)', () => {
    expect(matchesPattern('file.ts', '**/*.ts')).toBe(true);
    expect(matchesPattern('index.ts', '**/*.ts')).toBe(true);
    expect(matchesPattern('src/file.ts', '**/*.ts')).toBe(true);
    expect(matchesPattern('file.py', '**/*.ts')).toBe(false);
  });

  it('matches single star patterns', () => {
    expect(matchesPattern('file.ts', '*.ts')).toBe(true);
    expect(matchesPattern('dir/file.ts', '*.ts')).toBe(false);
  });

  it('matches question mark wildcards', () => {
    expect(matchesPattern('file1.ts', 'file?.ts')).toBe(true);
    expect(matchesPattern('file12.ts', 'file?.ts')).toBe(false);
    expect(matchesPattern('src/foo1.ts', 'src/foo?.ts')).toBe(true);
    expect(matchesPattern('src/foo12.ts', 'src/foo?.ts')).toBe(false);
  });

  it('handles mixed patterns', () => {
    expect(matchesPattern('src/components/Button.tsx', 'src/**/*.tsx')).toBe(true);
    expect(matchesPattern('src/components/Button.ts', 'src/**/*.tsx')).toBe(false);
  });
});

describe('matchesRootFiles', () => {
  it('returns true when no root files specified', () => {
    const config: LspServerConfig = { command: 'typescript-language-server', args: [] };
    expect(matchesRootFiles(config, '/tmp')).toBe(true);
  });

  it('returns true when root files array is empty', () => {
    const config: LspServerConfig = { command: 'typescript-language-server', args: [], rootFiles: [] };
    expect(matchesRootFiles(config, '/tmp')).toBe(true);
  });
});

describe('serverMatchesFile', () => {
  it('returns false for disabled servers', () => {
    const config: LspServerConfig = { command: 'lsp', args: [], enabled: false };
    expect(serverMatchesFile(config, 'file.ts', '/tmp')).toBe(false);
  });

  it('matches by file patterns', () => {
    const config: LspServerConfig = {
      command: 'lsp',
      args: [],
      filePatterns: ['**/*.ts'],
    };
    expect(serverMatchesFile(config, 'src/file.ts', '/tmp')).toBe(true);
    expect(serverMatchesFile(config, 'src/file.js', '/tmp')).toBe(false);
  });

  it('defaults to TypeScript/JavaScript files when no patterns or root files specified', () => {
    const config: LspServerConfig = { command: 'lsp', args: [] };
    expect(serverMatchesFile(config, 'src/foo.ts', '/tmp')).toBe(true);
    expect(serverMatchesFile(config, 'src/foo.tsx', '/tmp')).toBe(true);
    expect(serverMatchesFile(config, 'src/foo.py', '/tmp')).toBe(false);
    expect(serverMatchesFile(config, 'index.ts', '/tmp')).toBe(true);
    expect(serverMatchesFile(config, 'main.js', '/tmp')).toBe(true);
    expect(serverMatchesFile(config, 'readme.md', '/tmp')).toBe(false);
  });

  it('lets explicitly configured patterns override the default', () => {
    const config: LspServerConfig = {
      command: 'lsp',
      args: [],
      filePatterns: ['**/*.py'],
    };
    expect(serverMatchesFile(config, 'src/foo.py', '/tmp')).toBe(true);
    expect(serverMatchesFile(config, 'src/foo.ts', '/tmp')).toBe(false);
  });
});
