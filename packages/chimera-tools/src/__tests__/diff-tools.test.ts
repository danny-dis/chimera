import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { writeFileTool } from '../tools/filesystem.js';
import { editBlockTool, editFileTool, searchReplaceTool, applyPatchTool } from '../tools/edit.js';
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

describe('mutating file tools — diff previews', () => {
  beforeEach(async () => {
    workspaceRoot = path.join('/tmp', `chimera-diff-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(workspaceRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  describe('write_file', () => {
    it('attaches a diff showing every line added for a brand-new file', async () => {
      const result = await writeFileTool.execute(
        { path: 'new.txt', content: 'hello\nworld\n' },
        makeContext(),
      );
      expect(result.created).toBe(true);
      expect(result.diff.unchanged).toBe(false);
      expect(result.diff.binary).toBe(false);
      expect(result.diff.additions).toBe(2);
      expect(result.diff.deletions).toBe(0);
      expect(result.diff.patch).toContain('+hello');
      expect(result.diff.patch).toContain('+world');
    });

    it('attaches a diff reflecting the overwrite of an existing file', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'existing.txt'), 'old content\n');

      const result = await writeFileTool.execute(
        { path: 'existing.txt', content: 'new content\n', overwrite: true },
        makeContext(),
      );
      expect(result.diff.unchanged).toBe(false);
      expect(result.diff.patch).toContain('-old content');
      expect(result.diff.patch).toContain('+new content');
    });

    it('reports unchanged for a no-op overwrite (identical content)', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'same.txt'), 'identical\n');

      const result = await writeFileTool.execute(
        { path: 'same.txt', content: 'identical\n', overwrite: true },
        makeContext(),
      );
      expect(result.diff.unchanged).toBe(true);
      expect(result.diff.patch).toBe('');
    });

    it('flags a binary target file instead of diffing it', async () => {
      const binaryPath = path.join(workspaceRoot, 'image.png');
      await fs.writeFile(binaryPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));

      const result = await writeFileTool.execute(
        { path: 'image.png', content: 'not actually png data', overwrite: true },
        makeContext(),
      );
      expect(result.diff.binary).toBe(true);
      expect(result.diff.patch).toBe('');
    });

    it('handles a CRLF on-disk file being edited via write_file without ^M noise', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'crlf.txt'), 'line1\r\nline2\r\nline3\r\n');

      const result = await writeFileTool.execute(
        { path: 'crlf.txt', content: 'line1\r\nCHANGED\r\nline3\r\n', overwrite: true },
        makeContext(),
      );
      expect(result.diff.unchanged).toBe(false);
      expect(result.diff.eolChanged).toBe(false);
      expect(result.diff.patch).not.toContain('\r');
      expect(result.diff.patch).toContain('-line2');
      expect(result.diff.patch).toContain('+CHANGED');
    });

    it('produces a diff that reflects exactly the buffer written (same bytes, re-read from disk)', async () => {
      const result = await writeFileTool.execute(
        { path: 'exact.txt', content: 'alpha\nbeta\n' },
        makeContext(),
      );
      const onDisk = await fs.readFile(path.join(workspaceRoot, 'exact.txt'), 'utf-8');
      expect(onDisk).toBe('alpha\nbeta\n');
      expect(result.diff.additions).toBe(2);
    });
  });

  describe('edit_block / edit_file', () => {
    it('attaches a diff for a targeted replacement', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'test.txt'), 'hello world\nfoo bar\n');

      const result = await editBlockTool.execute(
        { path: 'test.txt', oldText: 'hello world', newText: 'hello universe' },
        makeContext(),
      );
      expect(result.diff.unchanged).toBe(false);
      expect(result.diff.patch).toContain('-hello world');
      expect(result.diff.patch).toContain('+hello universe');
      expect(result.diff.additions).toBe(1);
      expect(result.diff.deletions).toBe(1);
    });

    it('edit_file alias carries the same diff field', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'alias.txt'), 'foo\n');

      const result = await editFileTool.execute(
        { path: 'alias.txt', old_string: 'foo', new_string: 'bar' },
        makeContext(),
      );
      expect(result.diff.patch).toContain('-foo');
      expect(result.diff.patch).toContain('+bar');
    });

    it('flags a binary file rather than diffing garbled text', async () => {
      const binaryPath = path.join(workspaceRoot, 'bin.dat');
      // Content containing a NUL byte and the search text so indexOf still finds it.
      await fs.writeFile(binaryPath, Buffer.concat([Buffer.from('needle'), Buffer.from([0x00]), Buffer.from('tail')]));

      const result = await editBlockTool.execute(
        { path: 'bin.dat', oldText: 'needle', newText: 'REPLACED' },
        makeContext(),
      );
      expect(result.diff.binary).toBe(true);
      expect(result.diff.patch).toBe('');
    });
  });

  describe('search_replace', () => {
    it('attaches a diff when a block is applied', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'sr.txt'), 'one\ntwo\nthree\n');

      const result = await searchReplaceTool.execute(
        { path: 'sr.txt', blocks: [{ search: 'two', replace: 'TWO' }] },
        makeContext(),
      );
      expect(result.applied).toBe(true);
      expect(result.diff.unchanged).toBe(false);
      expect(result.diff.patch).toContain('-two');
      expect(result.diff.patch).toContain('+TWO');
    });

    it('reports unchanged when no block matches (no-op)', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'sr-noop.txt'), 'content\n');

      const result = await searchReplaceTool.execute(
        { path: 'sr-noop.txt', blocks: [{ search: 'missing', replace: 'x' }] },
        makeContext(),
      );
      expect(result.applied).toBe(false);
      expect(result.diff.unchanged).toBe(true);
      expect(result.diff.patch).toBe('');
    });
  });

  describe('apply_patch', () => {
    it('attaches a per-file diff preview computed before git apply runs', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'test.txt'), 'original line\n');

      const patch = `diff --git a/test.txt b/test.txt
--- a/test.txt
+++ b/test.txt
@@ -1 +1 @@
-original line
+modified line
`;

      const result = await applyPatchTool.execute({ patch }, makeContext());
      expect(result.applied).toBe(true);
      expect(result.diffs).toHaveLength(1);
      expect(result.diffs[0].path).toBe('test.txt');
      expect(result.diffs[0].previewApplied).toBe(true);
      expect(result.diffs[0].patch).toContain('-original line');
      expect(result.diffs[0].patch).toContain('+modified line');
    });

    it('computes the preview before writing — unaffected by dryRun leaving the file untouched', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'test.txt'), 'original line\n');

      const patch = `diff --git a/test.txt b/test.txt
--- a/test.txt
+++ b/test.txt
@@ -1 +1 @@
-original line
+modified line
`;

      const result = await applyPatchTool.execute({ patch, dryRun: true }, makeContext());
      expect(result.applied).toBe(true);
      expect(result.diffs[0].patch).toContain('+modified line');

      // File on disk must remain untouched by a dry run.
      const content = await fs.readFile(path.join(workspaceRoot, 'test.txt'), 'utf-8');
      expect(content).toBe('original line\n');
    });

    it('produces per-file diffs for multi-file patches', async () => {
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
      expect(result.diffs).toHaveLength(2);
      const paths = result.diffs.map((d) => d.path).sort();
      expect(paths).toEqual(['a.txt', 'b.txt']);
    });

    it('previews new-file creation (missing file treated as empty)', async () => {
      const patch = `diff --git a/created.txt b/created.txt
new file mode 100644
--- /dev/null
+++ b/created.txt
@@ -0,0 +1,2 @@
+line one
+line two
`;

      const result = await applyPatchTool.execute({ patch }, makeContext());
      expect(result.diffs).toHaveLength(1);
      expect(result.diffs[0].path).toBe('created.txt');
      expect(result.diffs[0].additions).toBe(2);
      expect(result.diffs[0].patch).toContain('+line one');
    });
  });
});
