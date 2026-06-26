import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { readFileTool, writeFileTool, listDirectoryTool } from '../tools/filesystem.js';
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

describe('Filesystem Tools', () => {
  beforeEach(async () => {
    workspaceRoot = path.join('/tmp', `chimera-fs-test-${Date.now()}`);
    await fs.mkdir(workspaceRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  describe('read_file', () => {
    it('reads a file successfully', async () => {
      const testFile = path.join(workspaceRoot, 'test.txt');
      await fs.writeFile(testFile, 'hello world\nline2\nline3');

      const result = await readFileTool.execute({ path: 'test.txt' }, makeContext());
      expect(result.content).toBe('hello world\nline2\nline3');
      expect(result.totalLines).toBe(3);
      expect(result.path).toBe('test.txt');
    });

    it('reads file with line range', async () => {
      const testFile = path.join(workspaceRoot, 'lines.txt');
      await fs.writeFile(testFile, 'line1\nline2\nline3\nline4\nline5');

      const result = await readFileTool.execute(
        { path: 'lines.txt', startLine: 2, endLine: 4 },
        makeContext(),
      );
      expect(result.content).toBe('line2\nline3\nline4');
      expect(result.totalLines).toBe(5);
    });

    it('rejects path outside workspace', async () => {
      await expect(
        readFileTool.execute({ path: '../../etc/passwd' }, makeContext()),
      ).rejects.toThrow('Path escapes workspace root');
    });

    it('reads binary files as text (no longer rejected)', async () => {
      const binaryFile = path.join(workspaceRoot, 'binary.bin');
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
      await fs.writeFile(binaryFile, buffer);

      // K1/K2 (phase-6a): isBinary early-return was removed. Non-image/PDF
      // files are now read as text; binary detection only fires for image/PDF
      // extensions via the IMG map.
      const result = await readFileTool.execute({ path: 'binary.bin' }, makeContext());
      expect(result.path).toBe('binary.bin');
      expect(result.media).toBeUndefined();
    });

    it('truncates large files', async () => {
      const largeFile = path.join(workspaceRoot, 'large.txt');
      const content = 'x'.repeat(150 * 1024); // 150KB
      await fs.writeFile(largeFile, content);

      const result = await readFileTool.execute({ path: 'large.txt' }, makeContext());
      expect(result.content).toContain('[truncated: file exceeds 100KB]');
      expect(result.content.length).toBeLessThan(content.length);
    });
  });

  describe('write_file', () => {
    it('creates a new file', async () => {
      const result = await writeFileTool.execute(
        { path: 'new.txt', content: 'hello' },
        makeContext(),
      );
      expect(result.created).toBe(true);
      expect(result.bytesWritten).toBe(5);
      expect(result.path).toBe('new.txt');

      const fileContent = await fs.readFile(path.join(workspaceRoot, 'new.txt'), 'utf-8');
      expect(fileContent).toBe('hello');
    });

    it('creates parent directories', async () => {
      const result = await writeFileTool.execute(
        { path: 'deep/nested/dir/file.txt', content: 'nested' },
        makeContext(),
      );
      expect(result.created).toBe(true);

      const exists = await fs.access(path.join(workspaceRoot, 'deep/nested/dir/file.txt'));
      expect(exists).toBeUndefined();
    });

    it('rejects overwriting without flag', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'existing.txt'), 'original');

      await expect(
        writeFileTool.execute({ path: 'existing.txt', content: 'new' }, makeContext()),
      ).rejects.toThrow('File already exists');
    });

    it('overwrites with flag', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'overwrite.txt'), 'original');

      const result = await writeFileTool.execute(
        { path: 'overwrite.txt', content: 'new', overwrite: true },
        makeContext(),
      );
      expect(result.created).toBe(false);
      expect(result.bytesWritten).toBe(3);

      const content = await fs.readFile(path.join(workspaceRoot, 'overwrite.txt'), 'utf-8');
      expect(content).toBe('new');
    });

    it('rejects path outside workspace', async () => {
      await expect(
        writeFileTool.execute({ path: '../../etc/evil.txt', content: 'bad' }, makeContext()),
      ).rejects.toThrow('Path escapes workspace root');
    });
  });

  describe('list_directory', () => {
    it('lists directory contents', async () => {
      await fs.mkdir(path.join(workspaceRoot, 'subdir'));
      await fs.writeFile(path.join(workspaceRoot, 'file1.txt'), 'a');
      await fs.writeFile(path.join(workspaceRoot, 'file2.txt'), 'b');

      const result = await listDirectoryTool.execute({}, makeContext());
      expect(result.totalFiles).toBe(2);
      expect(result.totalDirs).toBe(1);
      expect(result.entries.some((e) => e.name === 'file1.txt')).toBe(true);
      expect(result.entries.some((e) => e.name === 'subdir')).toBe(true);
    });

    it('respects depth limit', async () => {
      await fs.mkdir(path.join(workspaceRoot, 'a/b/c'), { recursive: true });
      await fs.writeFile(path.join(workspaceRoot, 'a/b/c/deep.txt'), 'deep');

      const result = await listDirectoryTool.execute({ depth: 1 }, makeContext());
      // With depth 1, should not see deep.txt
      const hasDeep = result.entries.some((e) => e.name === 'deep.txt');
      expect(hasDeep).toBe(false);
    });

    it('skips hidden files by default', async () => {
      await fs.writeFile(path.join(workspaceRoot, '.hidden'), 'secret');
      await fs.writeFile(path.join(workspaceRoot, 'visible.txt'), 'public');

      const result = await listDirectoryTool.execute({}, makeContext());
      expect(result.entries.some((e) => e.name === '.hidden')).toBe(false);
      expect(result.entries.some((e) => e.name === 'visible.txt')).toBe(true);
    });

    it('includes hidden files when flag is set', async () => {
      await fs.writeFile(path.join(workspaceRoot, '.hidden'), 'secret');

      const result = await listDirectoryTool.execute({ includeHidden: true }, makeContext());
      expect(result.entries.some((e) => e.name === '.hidden')).toBe(true);
    });

    it('skips node_modules by default', async () => {
      await fs.mkdir(path.join(workspaceRoot, 'node_modules/pkg'), { recursive: true });
      await fs.writeFile(path.join(workspaceRoot, 'node_modules/pkg/index.js'), 'code');

      const result = await listDirectoryTool.execute({}, makeContext());
      expect(result.entries.some((e) => e.path.includes('node_modules'))).toBe(false);
    });
  });
});
