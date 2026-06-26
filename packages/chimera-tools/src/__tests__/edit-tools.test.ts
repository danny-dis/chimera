import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { applyPatchTool, editBlockTool } from '../tools/edit.js';
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

describe('Edit Tools', () => {
  beforeEach(async () => {
    workspaceRoot = path.join('/tmp', `chimera-edit-test-${Date.now()}`);
    await fs.mkdir(workspaceRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  describe('apply_patch', () => {
    it('applies a valid patch in dry-run mode', async () => {
      const filePath = 'test.txt';
      await fs.writeFile(path.join(workspaceRoot, filePath), 'original line\n');

      const patch = `diff --git a/test.txt b/test.txt
--- a/test.txt
+++ b/test.txt
@@ -1 +1 @@
-original line
+modified line
`;

      const result = await applyPatchTool.execute(
        { patch, dryRun: true },
        makeContext(),
      );
      expect(result.applied).toBe(true);
      expect(result.hunksApplied).toBe(1);

      // File should be unchanged after dry-run
      const content = await fs.readFile(path.join(workspaceRoot, filePath), 'utf-8');
      expect(content).toBe('original line\n');
    });

    it('applies a valid patch', async () => {
      const filePath = 'test.txt';
      await fs.writeFile(path.join(workspaceRoot, filePath), 'original line\n');

      const patch = `diff --git a/test.txt b/test.txt
--- a/test.txt
+++ b/test.txt
@@ -1 +1 @@
-original line
+modified line
`;

      const result = await applyPatchTool.execute({ patch }, makeContext());
      expect(result.applied).toBe(true);
      expect(result.hunksApplied).toBe(1);

      const content = await fs.readFile(path.join(workspaceRoot, filePath), 'utf-8');
      // git apply on Windows may convert LF to CRLF depending on core.autocrlf.
      // Normalize line endings before comparing.
      expect(content.replace(/\r\n/g, '\n')).toBe('modified line\n');
    });

    it('returns applied=false for invalid patch in dry-run', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'test.txt'), 'content\n');

      const patch = `diff --git a/test.txt b/test.txt
--- a/test.txt
+++ b/test.txt
@@ -1 +1 @@
-nonexistent content
+new content
`;

      const result = await applyPatchTool.execute(
        { patch, dryRun: true },
        makeContext(),
      );
      expect(result.applied).toBe(false);
    });

    it('handles multi-file patches', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'a.txt'), 'file a\n');
      await fs.writeFile(path.join(workspaceRoot, 'b.txt'), 'file b\n');

      const patch = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-file a
+modified a
diff --git a/b.txt b/b.txt
--- a/b.txt
+++ b/b.txt
@@ -1 +1 @@
-file b
+modified b
`;

      const result = await applyPatchTool.execute({ patch }, makeContext());
      expect(result.applied).toBe(true);
      expect(result.filesChanged.length).toBe(2);
      expect(result.hunksApplied).toBe(2);
    });
  });

  describe('edit_block', () => {
    it('replaces text in a file', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'test.txt'), 'hello world\nfoo bar\n');

      const result = await editBlockTool.execute(
        {
          path: 'test.txt',
          oldText: 'hello world',
          newText: 'hello universe',
        },
        makeContext(),
      );
      expect(result.applied).toBe(true);
      expect(result.replacements).toBe(1);

      const content = await fs.readFile(path.join(workspaceRoot, 'test.txt'), 'utf-8');
      expect(content).toBe('hello universe\nfoo bar\n');
    });

    it('replaces all occurrences with replaceAll flag', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'test.txt'), 'foo\nbar\nfoo\nbaz\nfoo\n');

      const result = await editBlockTool.execute(
        {
          path: 'test.txt',
          oldText: 'foo',
          newText: 'qux',
          replaceAll: true,
        },
        makeContext(),
      );
      expect(result.applied).toBe(true);
      expect(result.replacements).toBe(3);

      const content = await fs.readFile(path.join(workspaceRoot, 'test.txt'), 'utf-8');
      expect(content).toBe('qux\nbar\nqux\nbaz\nqux\n');
    });

    it('fails when oldText is not found', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'test.txt'), 'hello world\n');

      await expect(
        editBlockTool.execute(
          { path: 'test.txt', oldText: 'not found', newText: 'replacement' },
          makeContext(),
        ),
      ).rejects.toThrow('oldText not found');
    });

    it('replaces only first occurrence without replaceAll', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'test.txt'), 'foo\nbar\nfoo\n');

      const result = await editBlockTool.execute(
        {
          path: 'test.txt',
          oldText: 'foo',
          newText: 'qux',
        },
        makeContext(),
      );
      expect(result.replacements).toBe(1);

      const content = await fs.readFile(path.join(workspaceRoot, 'test.txt'), 'utf-8');
      expect(content).toBe('qux\nbar\nfoo\n');
    });

    it('rejects path outside workspace', async () => {
      await expect(
        editBlockTool.execute(
          { path: '../../etc/passwd', oldText: 'x', newText: 'y' },
          makeContext(),
        ),
      ).rejects.toThrow('Path escapes workspace root');
    });
  });
});
