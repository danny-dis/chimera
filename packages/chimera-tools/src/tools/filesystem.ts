import { z } from 'zod';
import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import { zodToJsonSchema } from '@chimera/core';
import type { EventStream, CostTracker, PermissionDecision } from '@chimera/core';
import type { ToolDefinition, ToolContext, FileEntry } from '../tool-schema.js';
import {
  PathSchema,
  FileEntrySchema,
  MAX_FILE_SIZE,
  IGNORED_DIRS,
} from '../tool-schema.js';
import { type MediaBlock, MediaBlockSchema } from './media-types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveAndValidate(basePath: string, workspaceRoot: string): string {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, basePath);
  // Allow the root itself and anything beneath it. `path.resolve` already
  // normalizes absolute paths (e.g. C:\Users\pc\Desktop\VirgilNet\Cargo.toml)
  // so absolute paths that land inside the workspace root are permitted.
  if (resolved === root || resolved.startsWith(root + path.sep)) {
    return resolved;
  }
  throw new Error(`Path escapes workspace root: ${basePath}`);
}

// Minimal gitignore pattern matcher
interface GitignoreRule {
  pattern: string;
  negated: boolean;
  anchored: boolean;
}

function parseGitignore(content: string): GitignoreRule[] {
  const rules: GitignoreRule[] = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    let pattern = line;
    const negated = pattern.startsWith('!');
    if (negated) pattern = pattern.slice(1);

    // Trailing spaces are ignored unless escaped
    pattern = pattern.replace(/\\ $/, ' ');

    // Anchored if contains / (except trailing)
    const anchored = pattern.includes('/') && !pattern.endsWith('/');

    rules.push({ pattern, negated, anchored });
  }
  return rules;
}

function matchesGitignore(relativePath: string, rules: GitignoreRule[]): boolean {
  let ignored = false;

  for (const rule of rules) {
    if (matchPattern(relativePath, rule.pattern, rule.anchored)) {
      ignored = !rule.negated;
    }
  }

  return ignored;
}

function matchPattern(filePath: string, pattern: string, anchored: boolean): boolean {
  // Handle directory-only patterns (trailing /)
  const isDirPattern = pattern.endsWith('/');
  const cleanPattern = isDirPattern ? pattern.slice(0, -1) : pattern;

  // If not anchored, match against basename or full path
  if (!anchored) {
    // Match against basename
    const basename = path.basename(filePath);
    if (minimatchSimple(basename, cleanPattern)) return true;
    // Match against full path
    if (minimatchSimple(filePath, cleanPattern)) return true;
    // Match any path segment
    const parts = filePath.split('/');
    for (let i = 0; i < parts.length; i++) {
      const subPath = parts.slice(i).join('/');
      if (minimatchSimple(subPath, cleanPattern)) return true;
    }
  } else {
    if (minimatchSimple(filePath, cleanPattern)) return true;
  }

  return false;
}

function minimatchSimple(str: string, pattern: string): boolean {
  // Convert glob pattern to regex
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars
    .replace(/\*\*/g, '\x00')               // Temp placeholder for **
    .replace(/\*/g, '[^/]*')                // * matches anything except /
    .replace(/\x00/g, '.*');                // ** matches anything including /

  // Handle ? wildcard
  regexStr = regexStr.replace(/\?/g, '[^/]');

  // Handle character classes
  // Already handled by escaping above, but we need to restore [ and ]
  // Simple approach: just use the regex as-is for common patterns

  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(str);
}

function loadGitignore(dir: string): GitignoreRule[] {
  const rules: GitignoreRule[] = [];

  // Add default ignored dirs
  for (const dir of IGNORED_DIRS) {
    rules.push({ pattern: dir, negated: false, anchored: false });
  }

  try {
    const content = readFileSync(path.join(dir, '.gitignore'), 'utf-8');
    rules.push(...parseGitignore(content));
  } catch {
    // No .gitignore found
  }

  return rules;
}

// ── read_file ────────────────────────────────────────────────────────────────

const IMG: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif' };
const IMG_MAX = 20 * 1024 * 1024, HEIC_MAX = 10 * 1024 * 1024, PDF_CAP = 100;

async function readImageMedia(p: string, m: string): Promise<MediaBlock> {
  const b = await fs.readFile(p);
  const cap = (m === 'image/heic' || m === 'image/heif') ? HEIC_MAX : IMG_MAX;
  if (b.length > cap) throw new Error(`Image exceeds ${cap / 1048576}MB limit (${b.length} bytes)`);
  return { kind: 'image', mime: m, base64: b.toString('base64'), bytes: b.length };
}

async function readPdfMedia(p: string, sp: number, ep: number) {
  const mod = await import('pdf-parse');
  const pdfParse: (b: Buffer) => Promise<{ numpages: number }> = (mod as any).default ?? mod;
  const b = await fs.readFile(p);
  const { numpages: pageCount } = await pdfParse(b);
  const lo = Math.max(1, sp);
  const hi = Math.min(ep, pageCount, sp + 99);
  return { pageCount, media: { kind: 'pdf' as const, mime: 'application/pdf' as const, base64: b.toString('base64'), bytes: b.length, pageCount, pages: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) } };
}

const ReadFileParamsSchema = z.object({
  path: PathSchema,
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  startPage: z.number().int().positive().optional(),
  endPage: z.number().int().positive().optional(),
}).refine(
  (d) => (d.startLine ?? d.endLine) === undefined || (d.startPage ?? d.endPage) === undefined,
  { message: 'startLine/endLine are mutually exclusive with startPage/endPage' },
);

const ReadFileReturnsSchema = z.object({
  content: z.string(),
  totalLines: z.number(),
  path: z.string(),
  media: MediaBlockSchema.optional(),
});

export const readFileTool: ToolDefinition<typeof ReadFileParamsSchema, typeof ReadFileReturnsSchema> = {
  name: 'read_file',
  description: 'Read file contents with optional line/page range support; reads images and PDFs natively',
  parameters: ReadFileParamsSchema,
  returns: ReadFileReturnsSchema,
  category: 'filesystem',
  permissionLevel: 'read',
  execute: async (params, context: ToolContext) => {
    const resolved = resolveAndValidate(params.path, context.workspaceRoot);
    const ext = path.extname(resolved).toLowerCase();
    const m = IMG[ext];
    if (m) return { content: '', totalLines: 0, path: params.path, media: await readImageMedia(resolved, m) };
    if (ext === '.pdf') {
      const sp = params.startPage ?? 1, ep = params.endPage ?? sp + 99;
      const { pageCount, media } = await readPdfMedia(resolved, sp, ep);
      const noRange = params.startPage === undefined && params.endPage === undefined;
      return { content: noRange && pageCount > PDF_CAP ? `PDF truncated to first ${PDF_CAP} of ${pageCount} pages` : '', totalLines: 0, path: params.path, media };
    }

    const buffer = await fs.readFile(resolved);

    let content = buffer.toString('utf-8');
    const allLines = content.split('\n');
    const totalLines = allLines.length;

    if (content.length > MAX_FILE_SIZE) {
      content = content.substring(0, MAX_FILE_SIZE);
      content += '\n... [truncated: file exceeds 100KB]';
    }

    if (params.startLine !== undefined || params.endLine !== undefined) {
      const start = params.startLine ? params.startLine - 1 : 0;
      const end = params.endLine ? params.endLine : allLines.length;
      const sliced = allLines.slice(start, end);
      content = sliced.join('\n');
    }

    return { content, totalLines, path: params.path };
  },
};

// ── write_file ───────────────────────────────────────────────────────────────

const WriteFileParamsSchema = z.object({
  path: PathSchema,
  content: z.string(),
  overwrite: z.boolean().default(false),
});

const WriteFileReturnsSchema = z.object({
  path: z.string(),
  bytesWritten: z.number(),
  created: z.boolean(),
});

export const writeFileTool: ToolDefinition<typeof WriteFileParamsSchema, typeof WriteFileReturnsSchema> = {
  name: 'write_file',
  description: 'Create or overwrite a file, creating parent directories as needed',
  parameters: WriteFileParamsSchema,
  returns: WriteFileReturnsSchema,
  category: 'filesystem',
  permissionLevel: 'write',
  execute: async (params, context: ToolContext) => {
    const resolved = resolveAndValidate(params.path, context.workspaceRoot);

    let created = false;
    try {
      await fs.access(resolved);
      if (!params.overwrite) {
        throw new Error(`File already exists and overwrite is false: ${params.path}`);
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        created = true;
        await fs.mkdir(path.dirname(resolved), { recursive: true });
      } else if (!params.overwrite) {
        throw err;
      }
    }

    const content = Buffer.from(params.content, 'utf-8');
    await fs.writeFile(resolved, content);

    return { path: params.path, bytesWritten: content.length, created };
  },
};

// ── list_directory ───────────────────────────────────────────────────────────

const ListDirectoryParamsSchema = z.object({
  path: z.string().optional(),
  depth: z.number().int().positive().default(3),
  includeHidden: z.boolean().default(false),
  gitignore: z.boolean().default(true),
});

const ListDirectoryReturnsSchema = z.object({
  entries: z.array(FileEntrySchema),
  path: z.string(),
  totalFiles: z.number(),
  totalDirs: z.number(),
});

async function scanDir(
  dir: string,
  workspaceRoot: string,
  maxDepth: number,
  includeHidden: boolean,
  rules: GitignoreRule[] | null,
  currentDepth = 0,
): Promise<FileEntry[]> {
  if (currentDepth > maxDepth) return [];

  const entries: FileEntry[] = [];
  const items = await fs.readdir(dir, { withFileTypes: true });

  for (const item of items) {
    const relativePath = path.relative(workspaceRoot, path.join(dir, item.name));
    if (rules && matchesGitignore(relativePath, rules)) continue;
    if (!includeHidden && item.name.startsWith('.')) continue;

    const fullPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      entries.push({ name: item.name, path: relativePath, type: 'directory' });
      const children = await scanDir(fullPath, workspaceRoot, maxDepth, includeHidden, rules, currentDepth + 1);
      entries.push(...children);
    } else if (item.isFile() || item.isSymbolicLink()) {
      let size: number | undefined;
      try {
        const stat = await fs.stat(fullPath);
        size = stat.size;
      } catch {
        // Skip inaccessible files
      }
      entries.push({
        name: item.name,
        path: relativePath,
        type: item.isSymbolicLink() ? 'symlink' : 'file',
        size,
      });
    }
  }

  return entries;
}

export const listDirectoryTool: ToolDefinition<typeof ListDirectoryParamsSchema, typeof ListDirectoryReturnsSchema> = {
  name: 'list_directory',
  description: 'List directory tree with gitignore awareness and depth control',
  parameters: ListDirectoryParamsSchema,
  returns: ListDirectoryReturnsSchema,
  category: 'filesystem',
  permissionLevel: 'read',
  execute: async (rawParams, context: ToolContext) => {
    // Apply Zod defaults so direct callers (e.g. tests) get the same
    // behavior as the registry, which already runs `parse()`.
    const params = ListDirectoryParamsSchema.parse(rawParams);
    const targetPath = params.path
      ? resolveAndValidate(params.path, context.workspaceRoot)
      : context.workspaceRoot;

    const rules = params.gitignore ? loadGitignore(targetPath) : null;

    const entries = await scanDir(
      targetPath,
      context.workspaceRoot,
      params.depth,
      params.includeHidden,
      rules,
    );

    const totalFiles = entries.filter((e) => e.type === 'file').length;
    const totalDirs = entries.filter((e) => e.type === 'directory').length;

    return {
      entries,
      path: params.path ?? '.',
      totalFiles,
      totalDirs,
    };
  },
};
