import { z } from 'zod';
import { execa } from 'execa';
import { promises as fs } from 'fs';
import path from 'path';
import type { ToolDefinition, ToolContext } from '../tool-schema.js';
import { PathSchema, MAX_OUTPUT_SIZE } from '../tool-schema.js';
import { computeFileDiff, FileDiffSchema, isBinaryBuffer, type FileDiff } from '../diff-util.js';
import { parsePatch, applyPatch as jsdiffApplyPatch } from 'diff';

function resolveAndValidate(basePath: string, workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot, basePath);
  if (!resolved.startsWith(path.resolve(workspaceRoot) + path.sep) &&
      resolved !== path.resolve(workspaceRoot)) {
    throw new Error(`Path escapes workspace root: ${basePath}`);
  }
  return resolved;
}

// ── apply_patch ──────────────────────────────────────────────────────────────

const ApplyPatchParamsSchema = z.object({
  patch: z.string().min(1, 'Patch must not be empty'),
  path: z.string().optional(),
  dryRun: z.boolean().default(false),
});

const ApplyPatchFileDiffSchema = FileDiffSchema.extend({
  // Whether the in-memory preview (jsdiff) could simulate applying this
  // file's hunks against current on-disk content. `false` means the preview
  // is empty/unavailable even though the real `git apply` below may still
  // succeed via its own fuzzy-matching — git is the actual writer here, this
  // preview is a best-effort approximation computed before it runs.
  previewApplied: z.boolean(),
});

const ApplyPatchReturnsSchema = z.object({
  applied: z.boolean(),
  filesChanged: z.array(z.string()),
  hunksApplied: z.number(),
  hunksFailed: z.number(),
  rejectFiles: z.array(z.string()),
  // Per-file unified-diff preview, computed BEFORE `git apply` runs by
  // simulating the patch in-memory against current on-disk content. For a
  // well-formed patch this matches what gets written, but — unlike the other
  // mutating tools — the actual write here is performed by a separate `git
  // apply` process, so this preview is advisory rather than guaranteed
  // byte-identical (see `previewApplied`).
  diffs: z.array(ApplyPatchFileDiffSchema),
});

/**
 * Best-effort per-file diff preview for apply_patch, computed before the
 * real `git apply` invocation. Simulates applying each file's hunks (via
 * jsdiff) against the file's current on-disk bytes. Never throws.
 */
async function buildPatchPreview(
  patch: string,
  workingDir: string,
): Promise<Array<FileDiff & { previewApplied: boolean }>> {
  let parsedFiles: ReturnType<typeof parsePatch>;
  try {
    parsedFiles = parsePatch(patch);
  } catch {
    return [];
  }

  const results: Array<FileDiff & { previewApplied: boolean }> = [];

  for (const pf of parsedFiles) {
    const rawName = pf.newFileName && pf.newFileName !== '/dev/null' ? pf.newFileName : pf.oldFileName;
    const filePath = (rawName ?? '').replace(/^[ab]\//, '');
    if (!filePath) continue;

    const targetPath = path.resolve(workingDir, filePath);
    let oldBuf: Buffer | null = null;
    try {
      oldBuf = await fs.readFile(targetPath);
    } catch {
      oldBuf = null;
    }

    if (oldBuf && isBinaryBuffer(oldBuf)) {
      results.push({
        path: filePath, patch: '', unchanged: false, binary: true,
        truncated: false, additions: 0, deletions: 0, eolChanged: false,
        previewApplied: false,
      });
      continue;
    }

    const oldStr = (oldBuf ?? Buffer.alloc(0)).toString('utf-8');
    let applied: string | false;
    try {
      applied = jsdiffApplyPatch(oldStr, pf);
    } catch {
      applied = false;
    }

    if (applied === false) {
      results.push({
        path: filePath, patch: '', unchanged: false, binary: false,
        truncated: false, additions: 0, deletions: 0, eolChanged: false,
        previewApplied: false,
      });
      continue;
    }

    const newBuf = Buffer.from(applied, 'utf-8');
    const diff = computeFileDiff(oldBuf, newBuf, filePath);
    results.push({ ...diff, previewApplied: true });
  }

  return results;
}

export const applyPatchTool: ToolDefinition<typeof ApplyPatchParamsSchema, typeof ApplyPatchReturnsSchema> = {
  name: 'apply_patch',
  description: 'Apply a unified diff patch with dry-run support and partial apply handling',
  parameters: ApplyPatchParamsSchema,
  returns: ApplyPatchReturnsSchema,
  category: 'edit',
  permissionLevel: 'write',
  /**
   * Pre-write preview: the same per-file diffs buildPatchPreview computes
   * inside execute (before `git apply` runs). Advisory — the real write is
   * delegated to a separate `git apply` process, so in fuzzy-match cases the
   * preview is a best-effort approximation, not guaranteed byte-identical.
   */
  previewDiff: async (params, context) => {
    const workingDir = params.path
      ? path.resolve(context.workspaceRoot, params.path as string)
      : context.workspaceRoot;
    return buildPatchPreview(params.patch as string, workingDir);
  },
  execute: async (params, context: ToolContext) => {
    const workingDir = params.path
      ? path.resolve(context.workspaceRoot, params.path)
      : context.workspaceRoot;

    // Write patch to temp file
    const patchFile = path.join(context.workspaceRoot, '.chimera-patch-tmp.diff');
    await fs.writeFile(patchFile, params.patch, 'utf-8');

    // Create backups of affected files before applying
    const filesToBackup = extractFilesFromPatch(params.patch);
    const backupDir = path.join(context.workspaceRoot, '.chimera-backup');

    // Diff preview — computed before any write (backup or real apply) so it
    // reflects the state of the files exactly as they are right now.
    const diffs = await buildPatchPreview(params.patch, workingDir);

    if (!params.dryRun) {
      await fs.mkdir(backupDir, { recursive: true });
      for (const file of filesToBackup) {
        const fullPath = path.resolve(context.workspaceRoot, file);
        try {
          const backupPath = path.join(backupDir, file.replace(/\//g, '__'));
          await fs.copyFile(fullPath, backupPath);
        } catch {
          // File may not exist yet (new file in patch)
        }
      }
    }

    try {
      if (params.dryRun) {
        const result = await execa('git', ['apply', '--check', '--verbose', patchFile], {
          cwd: workingDir,
          timeout: 30_000,
          maxBuffer: MAX_OUTPUT_SIZE,
          reject: false,
        });

        if (result.exitCode !== 0) {
          return {
            applied: false,
            filesChanged: [],
            hunksApplied: 0,
            hunksFailed: 0,
            rejectFiles: [],
            diffs,
          };
        }

        return {
          applied: true,
          filesChanged: filesToBackup,
          hunksApplied: countHunks(params.patch),
          hunksFailed: 0,
          rejectFiles: [],
          diffs,
        };
      }

      // Actual apply
      const result = await execa('git', ['apply', '--verbose', patchFile], {
        cwd: workingDir,
        timeout: 30_000,
        maxBuffer: MAX_OUTPUT_SIZE,
        reject: false,
      });

      if (result.exitCode === 0) {
        return {
          applied: true,
          filesChanged: filesToBackup,
          hunksApplied: countHunks(params.patch),
          hunksFailed: 0,
          rejectFiles: [],
          diffs,
        };
      }

      // Try partial apply with --reject
      const rejectResult = await execa('git', ['apply', '--reject', '--verbose', patchFile], {
        cwd: workingDir,
        timeout: 30_000,
        maxBuffer: MAX_OUTPUT_SIZE,
        reject: false,
      });

      // Find .rej files
      const rejectFiles: string[] = [];
      try {
        const findResult = await execa('find', [workingDir, '-name', '*.rej'], {
          timeout: 10_000,
          maxBuffer: MAX_OUTPUT_SIZE,
          reject: false,
        });
        if (findResult.stdout.trim()) {
          rejectFiles.push(...findResult.stdout.trim().split('\n'));
        }
      } catch {
        // No .rej files found
      }

      return {
        applied: rejectResult.exitCode === 0 || rejectFiles.length === 0,
        filesChanged: filesToBackup,
        hunksApplied: countHunks(params.patch) - rejectFiles.length,
        hunksFailed: rejectFiles.length,
        rejectFiles,
        diffs,
      };
    } finally {
      // Clean up temp patch file
      try {
        await fs.unlink(patchFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  },
};

function extractFilesFromPatch(patch: string): string[] {
  const files = new Set<string>();
  const lines = patch.split('\n');
  for (const line of lines) {
    if (line.startsWith('--- a/') || line.startsWith('+++ b/')) {
      const file = line.replace(/^--- a\//, '').replace(/^\+\+\+ b\//, '').replace(/^\/dev\/null$/, '');
      if (file) files.add(file);
    }
  }
  return Array.from(files);
}

function countHunks(patch: string): number {
  let count = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) count++;
  }
  return count;
}

// ── edit_block ───────────────────────────────────────────────────────────────

const EditBlockParamsSchema = z.object({
  path: PathSchema,
  oldText: z.string().min(1, 'oldText must not be empty'),
  newText: z.string(),
  replaceAll: z.boolean().default(false),
});

const EditBlockReturnsSchema = z.object({
  applied: z.boolean(),
  path: z.string(),
  replacements: z.number(),
  // Unified diff of exactly what was written, computed from the same buffer
  // that hit disk (additive metadata; see diff-util.ts).
  diff: FileDiffSchema,
});

interface BuiltEdit {
  newContent: string;
  replacements: number;
}

/**
 * Compute the post-edit content for an exact (or lenient line-anchored)
 * replacement without touching disk. Shared by edit_block's execute (which
 * writes the buffer) and its pre-write previewDiff (which only reports it).
 * Returns `null` when oldText cannot be matched — the tool then fails in
 * execute with similar-line suggestions.
 */
function buildEditNewContent(
  content: string,
  oldText: string,
  newText: string,
  replaceAll: boolean,
): BuiltEdit | null {
  // Exact match first.
  const firstIndex = content.indexOf(oldText);
  if (firstIndex === -1) {
    // Lenient fallback: models (esp. small/cheap ones) often emit a partial
    // or truncated oldText. Anchor on the first line that *contains* the
    // snippet and replace that whole line. This turns a hard "not found"
    // failure into a best-effort edit instead of dropping the change.
    const needle = oldText.trim();
    if (needle.length > 0) {
      const lines = content.split('\n');
      const lineIdx = lines.findIndex((ln) => ln.includes(needle));
      if (lineIdx !== -1) {
        lines[lineIdx] = newText;
        return { newContent: lines.join('\n'), replacements: 1 };
      }
    }
    return null;
  }

  if (replaceAll) {
    const parts = content.split(oldText);
    return { newContent: parts.join(newText), replacements: parts.length - 1 };
  }

  // Single replacement
  return {
    newContent:
      content.substring(0, firstIndex) +
      newText +
      content.substring(firstIndex + oldText.length),
    replacements: 1,
  };
}

export const editBlockTool: ToolDefinition<typeof EditBlockParamsSchema, typeof EditBlockReturnsSchema> = {
  name: 'edit_block',
  description: 'Targeted text replacement in a file with exact match',
  parameters: EditBlockParamsSchema,
  returns: EditBlockReturnsSchema,
  category: 'edit',
  permissionLevel: 'write',
  previewDiff: async (params, context) => {
    try {
      const resolved = path.resolve(context.workspaceRoot, params.path as string);
      const oldBuf = await fs.readFile(resolved);
      const built = buildEditNewContent(
        oldBuf.toString('utf-8'),
        params.oldText as string,
        (params.newText as string | undefined) ?? '',
        params.replaceAll === true,
      );
      if (!built) return null;
      return [computeFileDiff(oldBuf, Buffer.from(built.newContent, 'utf-8'), params.path as string)];
    } catch {
      return null;
    }
  },
  execute: async (params, context: ToolContext) => {
    const resolved = path.resolve(context.workspaceRoot, params.path);

    if (!resolved.startsWith(path.resolve(context.workspaceRoot) + path.sep) &&
        resolved !== path.resolve(context.workspaceRoot)) {
      throw new Error(`Path escapes workspace root: ${params.path}`);
    }

    const oldBuf = await fs.readFile(resolved);
    const built = buildEditNewContent(
      oldBuf.toString('utf-8'),
      params.oldText,
      params.newText,
      params.replaceAll,
    );

    if (!built) {
      // Provide helpful suggestions
      const similarLines = findSimilarLines(oldBuf.toString('utf-8'), params.oldText);
      throw new Error(
        `oldText not found in file. Similar lines found:\n${similarLines.join('\n')}`,
      );
    }

    const newBuf = Buffer.from(built.newContent, 'utf-8');
    const diff = computeFileDiff(oldBuf, newBuf, params.path);
    await fs.writeFile(resolved, newBuf);

    return { applied: true, path: params.path, replacements: built.replacements, diff };
  },
};

// ── edit_file (alias of edit_block, the name the harness advertises) ─────────
// `coreToolsForTier` and the permission policies reference `edit_file`, but the
// underlying implementation is registered as `edit_block`. Without this alias a
// model that emits an `edit_file` tool call has no matching tool, so the call is
// silently dropped and the model falls back to describing the edit in prose.
// Accepts both `old_string`/`new_string` and `oldText`/`newText` spellings.

const EditFileParamsSchema = z
  .object({
    path: PathSchema,
    old_string: z.string().optional(),
    new_string: z.string().optional(),
    oldText: z.string().optional(),
    newText: z.string().optional(),
    replaceAll: z.boolean().default(false),
  })
  .refine(
    (d) => (d.old_string ?? d.oldText) !== undefined && (d.new_string ?? d.newText) !== undefined,
    { message: 'Either old_string/oldText and new_string/newText must be provided' },
  );

const EditFileReturnsSchema = z.object({
  applied: z.boolean(),
  path: z.string(),
  replacements: z.number(),
  diff: FileDiffSchema,
});

export const editFileTool: ToolDefinition<typeof EditFileParamsSchema, typeof EditFileReturnsSchema> = {
  name: 'edit_file',
  description: 'Edit an existing file by replacing an exact old_string/oldText with new_string/newText.',
  parameters: EditFileParamsSchema,
  returns: EditFileReturnsSchema,
  category: 'edit',
  permissionLevel: 'write',
  previewDiff: async (params, context) => {
    const oldText = (params.old_string ?? params.oldText) as string;
    const newText = (params.new_string ?? params.newText ?? '') as string;
    return (
      editBlockTool.previewDiff?.(
        { path: params.path, oldText, newText, replaceAll: params.replaceAll === true },
        context,
      ) ?? null
    );
  },
  execute: async (params, context: ToolContext) => {
    const oldText = (params.old_string ?? params.oldText) as string;
    const newText = (params.new_string ?? params.newText ?? '') as string;
    return editBlockTool.execute({ path: params.path, oldText, newText, replaceAll: params.replaceAll }, context);
  },
};

// ── search_replace ──────────────────────────────────────────────────────────

interface SearchReplaceBlock {
  search: string;
  replace: string;
}

const SearchReplaceParamsSchema = z.object({
  path: PathSchema,
  blocks: z.array(z.object({
    search: z.string().min(1, 'search block must not be empty'),
    replace: z.string(),
  })).optional(),
  text: z.string().optional(),
}).refine(
  (data) => (data.blocks && data.blocks.length > 0) || (data.text && data.text.length > 0),
  { message: 'Either blocks or text must be provided' },
);

const SearchReplaceReturnsSchema = z.object({
  applied: z.boolean(),
  path: z.string(),
  replacements: z.number(),
  failures: z.array(z.object({
    search: z.string(),
    reason: z.string(),
    similarLines: z.array(z.string()),
  })),
  diff: FileDiffSchema,
});

function parseSearchReplaceBlocks(text: string): SearchReplaceBlock[] {
  const blocks: SearchReplaceBlock[] = [];
  const lines = text.split('\n');
  let currentBlock: Partial<SearchReplaceBlock> | null = null;
  let section: 'search' | 'replace' | null = null;

  for (const line of lines) {
    if (line.startsWith('<<<<<<< SEARCH')) {
      currentBlock = { search: '', replace: '' };
      section = 'search';
      continue;
    }
    if (line.trim() === '=======') {
      section = 'replace';
      continue;
    }
    if (line.startsWith('>>>>>>> REPLACE')) {
      if (currentBlock?.search !== undefined && currentBlock?.replace !== undefined) {
        blocks.push(currentBlock as SearchReplaceBlock);
      }
      currentBlock = null;
      section = null;
      continue;
    }
    if (currentBlock && section === 'search') {
      currentBlock.search += (currentBlock.search ? '\n' : '') + line;
    } else if (currentBlock && section === 'replace') {
      currentBlock.replace += (currentBlock.replace ? '\n' : '') + line;
    }
  }

  return blocks;
}

interface AppliedSearchReplace {
  content: string;
  replacements: number;
  failures: Array<{ search: string; reason: string; similarLines: string[] }>;
}

/**
 * Apply search/replace blocks to a string without touching disk. Shared by
 * search_replace's execute (which writes when anything matched) and its
 * pre-write previewDiff (which only reports).
 */
function applySearchReplaceBlocks(content: string, blocks: SearchReplaceBlock[]): AppliedSearchReplace {
  let c = content;
  let totalReplacements = 0;
  const failures: Array<{ search: string; reason: string; similarLines: string[] }> = [];

  for (const block of blocks) {
    const index = c.indexOf(block.search);
    if (index === -1) {
      failures.push({
        search: block.search.slice(0, 100),
        reason: 'Search text not found in file',
        similarLines: findSimilarLines(c, block.search),
      });
      continue;
    }

    const parts = c.split(block.search);
    const count = parts.length - 1;
    c = parts.join(block.replace);
    totalReplacements += count;
  }

  return { content: c, replacements: totalReplacements, failures };
}

export const searchReplaceTool: ToolDefinition<typeof SearchReplaceParamsSchema, typeof SearchReplaceReturnsSchema> = {
  name: 'search_replace',
  description: 'Apply search-and-replace edits to a file. Accepts either structured blocks or raw SEARCH/REPLACE text format.',
  parameters: SearchReplaceParamsSchema,
  returns: SearchReplaceReturnsSchema,
  category: 'edit',
  permissionLevel: 'write',
  previewDiff: async (params, context) => {
    try {
      const resolved = resolveAndValidate(params.path as string, context.workspaceRoot);
      const oldBuf = await fs.readFile(resolved);
      const blocks: SearchReplaceBlock[] =
        (params.blocks as SearchReplaceBlock[] | undefined) ??
        parseSearchReplaceBlocks((params.text as string | undefined) ?? '');
      const { content: newContent, replacements } = applySearchReplaceBlocks(oldBuf.toString('utf-8'), blocks);
      if (replacements === 0) return null;
      return [computeFileDiff(oldBuf, Buffer.from(newContent, 'utf-8'), params.path as string)];
    } catch {
      return null;
    }
  },
  execute: async (params, context: ToolContext) => {
    const resolved = resolveAndValidate(params.path, context.workspaceRoot);
    const oldBuf = await fs.readFile(resolved);

    // Resolve blocks from either structured input or raw text
    const blocks: SearchReplaceBlock[] = (params.blocks as SearchReplaceBlock[] | undefined) ?? parseSearchReplaceBlocks(params.text!);

    const { content: newContent, replacements: totalReplacements, failures } =
      applySearchReplaceBlocks(oldBuf.toString('utf-8'), blocks);

    const newBuf = Buffer.from(newContent, 'utf-8');
    const diff = computeFileDiff(oldBuf, newBuf, params.path);

    if (totalReplacements > 0) {
      await fs.writeFile(resolved, newBuf);
    }

    return {
      applied: totalReplacements > 0,
      path: params.path,
      replacements: totalReplacements,
      failures,
      diff,
    };
  },
};

function findSimilarLines(content: string, searchText: string, maxResults = 3): string[] {
  const lines = content.split('\n');
  const searchLower = searchText.toLowerCase();
  const scored = lines
    .map((line, index) => ({
      line: line.trim(),
      index: index + 1,
      score: similarity(line.toLowerCase(), searchLower),
    }))
    .filter((item) => item.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return scored.map((item) => `Line ${item.index}: ${item.line}`);
}

function similarity(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;

  if (longer.includes(shorter)) return shorter.length / longer.length;

  // Simple character overlap
  const longerArr = longer.split('');
  let matches = 0;
  for (const char of shorter) {
    const idx = longerArr.indexOf(char);
    if (idx !== -1) {
      matches++;
      longerArr.splice(idx, 1);
    }
  }
  return matches / longer.length;
}
