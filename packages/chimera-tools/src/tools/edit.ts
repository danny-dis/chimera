import { z } from 'zod';
import { execa } from 'execa';
import { promises as fs } from 'fs';
import path from 'path';
import type { ToolDefinition, ToolContext } from '../tool-schema.js';
import { PathSchema, MAX_OUTPUT_SIZE } from '../tool-schema.js';

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

const ApplyPatchReturnsSchema = z.object({
  applied: z.boolean(),
  filesChanged: z.array(z.string()),
  hunksApplied: z.number(),
  hunksFailed: z.number(),
  rejectFiles: z.array(z.string()),
});

export const applyPatchTool: ToolDefinition<typeof ApplyPatchParamsSchema, typeof ApplyPatchReturnsSchema> = {
  name: 'apply_patch',
  description: 'Apply a unified diff patch with dry-run support and partial apply handling',
  parameters: ApplyPatchParamsSchema,
  returns: ApplyPatchReturnsSchema,
  category: 'edit',
  permissionLevel: 'write',
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
          };
        }

        return {
          applied: true,
          filesChanged: filesToBackup,
          hunksApplied: countHunks(params.patch),
          hunksFailed: 0,
          rejectFiles: [],
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
});

export const editBlockTool: ToolDefinition<typeof EditBlockParamsSchema, typeof EditBlockReturnsSchema> = {
  name: 'edit_block',
  description: 'Targeted text replacement in a file with exact match',
  parameters: EditBlockParamsSchema,
  returns: EditBlockReturnsSchema,
  category: 'edit',
  permissionLevel: 'write',
  execute: async (params, context: ToolContext) => {
    const resolved = path.resolve(context.workspaceRoot, params.path);

    if (!resolved.startsWith(path.resolve(context.workspaceRoot) + path.sep) &&
        resolved !== path.resolve(context.workspaceRoot)) {
      throw new Error(`Path escapes workspace root: ${params.path}`);
    }

    const content = await fs.readFile(resolved, 'utf-8');

    // Exact match first.
    const firstIndex = content.indexOf(params.oldText);
    if (firstIndex === -1) {
      // Lenient fallback: models (esp. small/cheap ones) often emit a partial
      // or truncated oldText. Anchor on the first line that *contains* the
      // snippet and replace that whole line. This turns a hard "not found"
      // failure into a best-effort edit instead of dropping the change.
      const needle = params.oldText.trim();
      if (needle.length > 0) {
        const lines = content.split('\n');
        const lineIdx = lines.findIndex((ln) => ln.includes(needle));
        if (lineIdx !== -1) {
          lines[lineIdx] = params.newText;
          const newContent = lines.join('\n');
          await fs.writeFile(resolved, newContent, 'utf-8');
          return { applied: true, path: params.path, replacements: 1 };
        }
      }
      // Provide helpful suggestions
      const similarLines = findSimilarLines(content, params.oldText);
      throw new Error(
        `oldText not found in file. Similar lines found:\n${similarLines.join('\n')}`,
      );
    }

    let replacements = 0;
    let newContent: string;

    if (params.replaceAll) {
      const parts = content.split(params.oldText);
      replacements = parts.length - 1;
      newContent = parts.join(params.newText);
    } else {
      // Single replacement
      newContent =
        content.substring(0, firstIndex) +
        params.newText +
        content.substring(firstIndex + params.oldText.length);
      replacements = 1;
    }

    await fs.writeFile(resolved, newContent, 'utf-8');

    return { applied: true, path: params.path, replacements };
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
});

export const editFileTool: ToolDefinition<typeof EditFileParamsSchema, typeof EditFileReturnsSchema> = {
  name: 'edit_file',
  description: 'Edit an existing file by replacing an exact old_string/oldText with new_string/newText.',
  parameters: EditFileParamsSchema,
  returns: EditFileReturnsSchema,
  category: 'edit',
  permissionLevel: 'write',
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

export const searchReplaceTool: ToolDefinition<typeof SearchReplaceParamsSchema, typeof SearchReplaceReturnsSchema> = {
  name: 'search_replace',
  description: 'Apply search-and-replace edits to a file. Accepts either structured blocks or raw SEARCH/REPLACE text format.',
  parameters: SearchReplaceParamsSchema,
  returns: SearchReplaceReturnsSchema,
  category: 'edit',
  permissionLevel: 'write',
  execute: async (params, context: ToolContext) => {
    const resolved = resolveAndValidate(params.path, context.workspaceRoot);
    let content = await fs.readFile(resolved, 'utf-8');
    let totalReplacements = 0;
    const failures: Array<{ search: string; reason: string; similarLines: string[] }> = [];

    // Resolve blocks from either structured input or raw text
    const blocks: SearchReplaceBlock[] = (params.blocks as SearchReplaceBlock[] | undefined) ?? parseSearchReplaceBlocks(params.text!);

    for (const block of blocks) {
      const index = content.indexOf(block.search);
      if (index === -1) {
        failures.push({
          search: block.search.slice(0, 100),
          reason: 'Search text not found in file',
          similarLines: findSimilarLines(content, block.search),
        });
        continue;
      }

      const parts = content.split(block.search);
      const count = parts.length - 1;
      content = parts.join(block.replace);
      totalReplacements += count;
    }

    if (totalReplacements > 0) {
      await fs.writeFile(resolved, content, 'utf-8');
    }

    return {
      applied: totalReplacements > 0,
      path: params.path,
      replacements: totalReplacements,
      failures,
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
