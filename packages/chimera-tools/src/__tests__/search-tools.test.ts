import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { searchFilesTool, globFilesTool } from '../tools/search.js';
import type { ToolContext } from '../tool-schema.js';
import { EventStream } from '@chimera/core';

let workspaceRoot: string;

function makeContext(): ToolContext {
  return {
    workspaceRoot,
    sessionId: 'test-session',
    eventStream: new EventStream(),
    costTracker: {
      setBudget: () => {},
      recordSpend: () => {},
      getSpend: () => 0,
      getRemaining: () => Infinity,
    } as any,
    permissionCheck: () => 'allow',
  };
}

describe('Search Tools', () => {
  beforeEach(async () => {
    workspaceRoot = path.join(os.tmpdir(), `chimera-search-test-${Date.now()}`);
    await fs.mkdir(workspaceRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  describe('search_files', () => {
    it('finds matching content in files', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'test.txt'), 'hello world\nfoo bar\nhello again');

      const result = await searchFilesTool.execute({ pattern: 'hello' }, makeContext());
      expect(result.totalMatches).toBeGreaterThanOrEqual(1);
      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      expect(result.matches[0].file).toBe('test.txt');
    });

    it('returns empty results for no match', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'test.txt'), 'nothing here');

      const result = await searchFilesTool.execute({ pattern: 'zzzznotfound' }, makeContext());
      expect(result.totalMatches).toBe(0);
      expect(result.matches).toEqual([]);
    });

    it('limits results to maxResults', async () => {
      // Create a file with many matching lines
      const lines = Array(200).fill('match this line').join('\n');
      await fs.writeFile(path.join(workspaceRoot, 'many.txt'), lines);

      const result = await searchFilesTool.execute({ pattern: 'match', maxResults: 5 }, makeContext());
      expect(result.matches.length).toBeLessThanOrEqual(5);
    });

    it('searches in specified path', async () => {
      await fs.mkdir(path.join(workspaceRoot, 'subdir'));
      await fs.writeFile(path.join(workspaceRoot, 'subdir/file.txt'), 'target content');
      await fs.writeFile(path.join(workspaceRoot, 'other.txt'), 'no match');

      const result = await searchFilesTool.execute(
        { pattern: 'target', path: 'subdir' },
        makeContext(),
      );
      expect(result.totalMatches).toBeGreaterThanOrEqual(1);
      expect(result.matches[0].file).toContain('subdir');
    });
  });

  describe('glob_files', () => {
    it('matches files by glob pattern', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'test.ts'), '');
      await fs.writeFile(path.join(workspaceRoot, 'util.ts'), '');
      await fs.writeFile(path.join(workspaceRoot, 'readme.md'), '');

      const result = await globFilesTool.execute({ pattern: '*.ts' }, makeContext());
      expect(result.count).toBeGreaterThanOrEqual(2);
      expect(result.files.some((f) => f.endsWith('test.ts'))).toBe(true);
      expect(result.files.some((f) => f.endsWith('util.ts'))).toBe(true);
    });

    it('returns empty for no match', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'test.txt'), '');

      const result = await globFilesTool.execute({ pattern: '*.xyz' }, makeContext());
      expect(result.count).toBe(0);
      expect(result.files).toEqual([]);
    });

    it('searches in specified path', async () => {
      await fs.mkdir(path.join(workspaceRoot, 'src'));
      await fs.writeFile(path.join(workspaceRoot, 'src/app.ts'), '');

      const result = await globFilesTool.execute({ pattern: '*.ts', path: 'src' }, makeContext());
      expect(result.count).toBeGreaterThanOrEqual(1);
    });
  });
});
