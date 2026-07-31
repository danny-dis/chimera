// Unified-diff generation for mutating file tools.
//
// Goal: before a write lands on disk, produce a diff of exactly what is about
// to change so a caller (CLI/TUI) can show it to the user for review/approval.
// This module is intentionally non-interactive — it only *computes* diffs; it
// never prompts, blocks, or gates. Gating on the result is the CLI/TUI's job.
//
// Contract for callers: always pass the *exact* buffer that will be (or was)
// written as `newBuf`, and the *exact* on-disk bytes as `oldBuf` (or `null`
// for a file that does not yet exist). Doing the diff from those same buffers
// is what keeps the preview from ever drifting away from reality.

import { structuredPatch, formatPatch } from 'diff';
import { z } from 'zod';

export const FileDiffSchema = z.object({
  /** Workspace-relative path used in the diff header. */
  path: z.string(),
  /** Unified diff text. Empty when unchanged, binary, or omitted for size. */
  patch: z.string(),
  /** True when old and new content are equivalent (no meaningful change). */
  unchanged: z.boolean(),
  /** True when either side looks like a binary file; `patch` is not produced. */
  binary: z.boolean(),
  /** True when the diff was capped (input too large or rendered patch too long). */
  truncated: z.boolean(),
  /** Line-addition count (0 when binary/truncated-before-diff/unchanged). */
  additions: z.number(),
  /** Line-deletion count (0 when binary/truncated-before-diff/unchanged). */
  deletions: z.number(),
  /** True when old/new sides use different dominant line-ending styles (CRLF vs LF). */
  eolChanged: z.boolean(),
});

export type FileDiff = z.infer<typeof FileDiffSchema>;

export interface DiffOptions {
  /** Lines of context around each hunk. Default 3 (the conventional unified-diff default). */
  context?: number;
  /** Per-side byte cap above which we skip diffing entirely and report `truncated`. */
  maxInputBytes?: number;
  /** Cap on the rendered patch text; longer output is truncated with a marker. */
  maxDiffBytes?: number;
  /**
   * Cap on the line-level edit distance jsdiff will explore before giving up.
   * Myers-diff cost is driven by edit distance, not just input size — a file
   * that is almost entirely rewritten (high edit distance) can be slow to
   * diff even when both sides are comfortably under `maxInputBytes`. This is
   * an independent safety valve for that case.
   */
  maxEditLength?: number;
}

const DEFAULT_CONTEXT = 3;
// Diffing cost scales with input size AND edit distance; cap the inputs so a
// pathological (e.g. auto-generated, minified, or binary-misdetected) file
// can't stall the tool call. 256KB comfortably covers real source files.
const DEFAULT_MAX_INPUT_BYTES = 256 * 1024;
// Independent cap on the rendered patch text itself: even a modestly sized
// file can produce a huge patch if nearly every line changed.
const DEFAULT_MAX_DIFF_BYTES = 64 * 1024;
// Independent cap on edit distance (see DiffOptions.maxEditLength above).
const DEFAULT_MAX_EDIT_LENGTH = 8000;
// Standard git/diff heuristic: a NUL byte in the first N bytes marks binary.
const BINARY_SNIFF_BYTES = 8000;

/** Git's classic heuristic: presence of a NUL byte in a leading sample. */
export function isBinaryBuffer(buf: Buffer): boolean {
  const len = Math.min(buf.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

function normalizeEol(s: string): string {
  return s.replace(/\r\n/g, '\n');
}

function hasCrlf(s: string): boolean {
  return s.includes('\r\n');
}

function emptyDiff(path: string, overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    path,
    patch: '',
    unchanged: false,
    binary: false,
    truncated: false,
    additions: 0,
    deletions: 0,
    eolChanged: false,
    ...overrides,
  };
}

/**
 * Compute a unified diff between `oldBuf` (current on-disk content — `null`
 * for a file that does not exist yet, treated as empty) and `newBuf` (the
 * exact bytes about to be written). Never throws: diff computation is best
 * effort and must never block or fail the underlying file operation.
 */
export function computeFileDiff(
  oldBuf: Buffer | null,
  newBuf: Buffer,
  filePath: string,
  options: DiffOptions = {},
): FileDiff {
  try {
    const context = options.context ?? DEFAULT_CONTEXT;
    const maxInputBytes = options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
    const maxDiffBytes = options.maxDiffBytes ?? DEFAULT_MAX_DIFF_BYTES;
    const maxEditLength = options.maxEditLength ?? DEFAULT_MAX_EDIT_LENGTH;

    const old = oldBuf ?? Buffer.alloc(0);

    // Byte-exact no-op (covers the common "wrote the same content" case,
    // including binary files, without doing any text work).
    if (old.equals(newBuf)) {
      return emptyDiff(filePath, { unchanged: true });
    }

    if (isBinaryBuffer(old) || isBinaryBuffer(newBuf)) {
      return emptyDiff(filePath, { binary: true });
    }

    if (old.length > maxInputBytes || newBuf.length > maxInputBytes) {
      return emptyDiff(filePath, {
        truncated: true,
        patch: `[diff omitted: content exceeds ${Math.round(maxInputBytes / 1024)}KB diff limit]`,
      });
    }

    const oldStr = old.toString('utf-8');
    const newStr = newBuf.toString('utf-8');

    // Diff on EOL-normalized text so a file that consistently uses CRLF
    // doesn't render every single line as changed (`\r` noise) when nothing
    // textual actually changed. We still report whether the dominant EOL
    // style differs between the two sides via `eolChanged`, since that *is*
    // a real change to the bytes that will be written, even if it's not a
    // textual one.
    const oldNorm = normalizeEol(oldStr);
    const newNorm = normalizeEol(newStr);
    const eolChanged = hasCrlf(oldStr) !== hasCrlf(newStr);

    if (oldNorm === newNorm) {
      return emptyDiff(filePath, { unchanged: true, eolChanged });
    }

    // Compute the diff exactly once via `structuredPatch` and render it to
    // text with `formatPatch` (rather than also calling `createTwoFilesPatch`,
    // which would redo the same Myers diff a second time).
    const structured = structuredPatch(filePath, filePath, oldNorm, newNorm, undefined, undefined, {
      context,
      maxEditLength,
    });

    if (!structured) {
      // Edit distance exceeded `maxEditLength` — jsdiff bailed out rather
      // than spend unbounded time diffing two nearly-unrelated texts.
      return emptyDiff(filePath, {
        truncated: true,
        patch: `[diff omitted: change is too large to diff efficiently (edit distance exceeds ${maxEditLength})]`,
      });
    }

    let additions = 0;
    let deletions = 0;
    for (const hunk of structured.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith('+')) additions++;
        else if (line.startsWith('-')) deletions++;
      }
    }

    let patch = formatPatch(structured);
    let truncated = false;
    if (patch.length > maxDiffBytes) {
      patch = `${patch.slice(0, maxDiffBytes)}\n... [diff truncated: rendered patch exceeds ${Math.round(maxDiffBytes / 1024)}KB]`;
      truncated = true;
    }

    return { path: filePath, patch, unchanged: false, binary: false, truncated, additions, deletions, eolChanged };
  } catch (err) {
    // Diff generation must never take down the actual file operation. Report
    // a safe, empty, non-blocking result and let the write proceed.
    return emptyDiff(filePath, {
      truncated: true,
      patch: `[diff unavailable: ${err instanceof Error ? err.message : String(err)}]`,
    });
  }
}

/**
 * Convenience wrapper for the common "read current file, diff against the
 * buffer about to be written" case. Returns `null` old content (treated as
 * empty) when the file does not exist.
 */
export async function diffAgainstDisk(
  readFile: (path: string) => Promise<Buffer>,
  resolvedPath: string,
  newBuf: Buffer,
  displayPath: string,
  options?: DiffOptions,
): Promise<FileDiff> {
  let oldBuf: Buffer | null = null;
  try {
    oldBuf = await readFile(resolvedPath);
  } catch {
    // Missing file: treated as empty (new-file creation).
    oldBuf = null;
  }
  return computeFileDiff(oldBuf, newBuf, displayPath, options);
}
