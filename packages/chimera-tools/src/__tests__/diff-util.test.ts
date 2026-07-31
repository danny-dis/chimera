import { describe, it, expect } from 'vitest';
import { computeFileDiff, diffAgainstDisk, isBinaryBuffer } from '../diff-util.js';

function buf(s: string): Buffer {
  return Buffer.from(s, 'utf-8');
}

describe('diff-util', () => {
  describe('computeFileDiff', () => {
    it('treats a missing file (null old buffer) as empty — new-file creation', () => {
      const result = computeFileDiff(null, buf('line1\nline2\n'), 'new.txt');
      expect(result.unchanged).toBe(false);
      expect(result.binary).toBe(false);
      expect(result.additions).toBe(2);
      expect(result.deletions).toBe(0);
      expect(result.patch).toContain('+line1');
      expect(result.patch).toContain('+line2');
      // Unified diff header should reference the file path.
      expect(result.patch).toContain('new.txt');
    });

    it('produces a unified diff for a modified file', () => {
      const oldContent = 'alpha\nbeta\ngamma\n';
      const newContent = 'alpha\nBETA\ngamma\n';
      const result = computeFileDiff(buf(oldContent), buf(newContent), 'mod.txt');
      expect(result.unchanged).toBe(false);
      expect(result.binary).toBe(false);
      expect(result.additions).toBe(1);
      expect(result.deletions).toBe(1);
      expect(result.patch).toContain('-beta');
      expect(result.patch).toContain('+BETA');
      // Context lines should be present (default context radius).
      expect(result.patch).toContain(' alpha');
      expect(result.patch).toContain(' gamma');
    });

    it('respects a configurable context radius', () => {
      const oldContent = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n') + '\n';
      const newContent = oldContent.replace('line10', 'CHANGED');

      const narrow = computeFileDiff(buf(oldContent), buf(newContent), 'ctx.txt', { context: 1 });
      const wide = computeFileDiff(buf(oldContent), buf(newContent), 'ctx.txt', { context: 5 });

      expect(narrow.patch.split('\n').length).toBeLessThan(wide.patch.split('\n').length);
    });

    it('reports a no-op write as unchanged with an empty patch', () => {
      const content = 'identical content\n';
      const result = computeFileDiff(buf(content), buf(content), 'noop.txt');
      expect(result.unchanged).toBe(true);
      expect(result.patch).toBe('');
      expect(result.additions).toBe(0);
      expect(result.deletions).toBe(0);
    });

    it('flags binary content instead of diffing it', () => {
      const oldBinary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);
      const newBinary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xee]);
      const result = computeFileDiff(oldBinary, newBinary, 'image.png');
      expect(result.binary).toBe(true);
      expect(result.patch).toBe('');
      expect(result.additions).toBe(0);
      expect(result.deletions).toBe(0);
    });

    it('detects binary via a NUL byte even when the extension looks textual', () => {
      const oldContent = buf('plain text\n');
      const newBinaryish = Buffer.from('plain\x00text\n', 'binary');
      const result = computeFileDiff(oldContent, newBinaryish, 'weird.txt');
      expect(result.binary).toBe(true);
    });

    it('truncates and flags very large inputs instead of diffing them', () => {
      const big = 'x'.repeat(400 * 1024); // 400KB > default 256KB cap
      const result = computeFileDiff(buf(''), buf(big), 'huge.txt', { maxInputBytes: 256 * 1024 });
      expect(result.truncated).toBe(true);
      expect(result.patch).toContain('diff omitted');
    });

    it('truncates an oversized rendered patch while keeping accurate counts', () => {
      // Every line changes -> large patch text even though the file itself
      // is under the input-size cap. Kept small (300 lines) so the test runs
      // fast — a fully-rewritten file is jsdiff's worst case for edit
      // distance; see the maxEditLength test below for the larger case.
      const oldContent = Array.from({ length: 300 }, (_, i) => `old-line-${i}`).join('\n') + '\n';
      const newContent = Array.from({ length: 300 }, (_, i) => `new-line-${i}`).join('\n') + '\n';
      const result = computeFileDiff(buf(oldContent), buf(newContent), 'big-diff.txt', { maxDiffBytes: 2000 });
      expect(result.truncated).toBe(true);
      expect(result.patch).toContain('diff truncated');
      expect(result.additions).toBe(300);
      expect(result.deletions).toBe(300);
    });

    it('bails out gracefully when edit distance exceeds maxEditLength', () => {
      // A fully-rewritten file has a huge edit distance (every line differs).
      // With a low maxEditLength, jsdiff should bail out fast instead of
      // paying the full Myers-diff cost.
      const oldContent = Array.from({ length: 500 }, (_, i) => `old-line-${i}`).join('\n') + '\n';
      const newContent = Array.from({ length: 500 }, (_, i) => `new-line-${i}`).join('\n') + '\n';
      const result = computeFileDiff(buf(oldContent), buf(newContent), 'huge-edit.txt', { maxEditLength: 50 });
      expect(result.truncated).toBe(true);
      expect(result.binary).toBe(false);
      expect(result.patch).toContain('too large to diff');
    });

    it('normalizes CRLF vs LF so an EOL-only change does not show every line as different', () => {
      const crlfContent = 'line1\r\nline2\r\nline3\r\n';
      const lfContent = 'line1\nline2\nline3\n';
      const result = computeFileDiff(buf(crlfContent), buf(lfContent), 'eol.txt');
      expect(result.unchanged).toBe(true);
      expect(result.eolChanged).toBe(true);
      expect(result.patch).toBe('');
    });

    it('renders a clean diff (no ^M noise) when a real edit is made to a CRLF file', () => {
      const oldContent = 'line1\r\nline2\r\nline3\r\n';
      const newContent = 'line1\r\nCHANGED\r\nline3\r\n';
      const result = computeFileDiff(buf(oldContent), buf(newContent), 'eol-edit.txt');
      expect(result.unchanged).toBe(false);
      expect(result.eolChanged).toBe(false);
      expect(result.patch).not.toContain('\r');
      expect(result.patch).toContain('-line2');
      expect(result.patch).toContain('+CHANGED');
    });

    it('never throws on empty buffers', () => {
      expect(() => computeFileDiff(buf(''), buf(''), 'empty.txt')).not.toThrow();
      const result = computeFileDiff(buf(''), buf(''), 'empty.txt');
      expect(result.unchanged).toBe(true);
    });
  });

  describe('diffAgainstDisk', () => {
    it('treats a read failure (missing file) as empty content', async () => {
      const readFile = async (_p: string) => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      };
      const result = await diffAgainstDisk(readFile, '/does/not/exist.txt', buf('fresh\n'), 'exist.txt');
      expect(result.unchanged).toBe(false);
      expect(result.additions).toBe(1);
      expect(result.patch).toContain('+fresh');
    });

    it('diffs against the buffer returned by readFile', async () => {
      const readFile = async (_p: string) => buf('old\n');
      const result = await diffAgainstDisk(readFile, '/some/file.txt', buf('new\n'), 'file.txt');
      expect(result.unchanged).toBe(false);
      expect(result.patch).toContain('-old');
      expect(result.patch).toContain('+new');
    });
  });

  describe('isBinaryBuffer', () => {
    it('returns false for plain text', () => {
      expect(isBinaryBuffer(buf('hello world\n'))).toBe(false);
    });

    it('returns true when a NUL byte is present', () => {
      expect(isBinaryBuffer(Buffer.from([0x68, 0x69, 0x00, 0x21]))).toBe(true);
    });
  });
});
