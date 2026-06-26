import { z } from 'zod';
import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import type { ToolDefinition, ToolContext, FileEntry } from '../tool-schema.js';
import {
  PathSchema,
  FileEntrySchema,
  MAX_FILE_SIZE,
  IGNORED_DIRS,
} from '../tool-schema.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveAndValidate(basePath: string, workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot, basePath);
  if (!resolved.startsWith(path.resolve(workspaceRoot) + path.sep) &&
      resolved !== path.resolve(workspaceRoot)) {
    throw new Error(`Path escapes workspace root: ${basePath}`);
  }
  return resolved;
}

function isBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 512);
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    if (byte === 0) return true;
    if (byte < 9 && byte !== 0 && byte !== 7 && byte !== 8 && byte !== 10 && byte !== 13) return true;
  }
  return false;
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

const ReadFileParamsSchema = z.object({
  path: PathSchema,
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
});

const ReadFileReturnsSchema = z.object({
  content: z.string(),
  totalLines: z.number(),
  path: z.string(),
});

export const readFileTool: ToolDefinition<typeof ReadFileParamsSchema, typeof ReadFileReturnsSchema> = {
  name: 'read_file',
  description: 'Read file contents with optional line range support',
  parameters: ReadFileParamsSchema,
  returns: ReadFileReturnsSchema,
  category: 'filesystem',
  permissionLevel: 'read',
  execute: async (params, context: ToolContext) => {
    const resolved = resolveAndValidate(params.path, context.workspaceRoot);
    const buffer = await fs.readFile(resolved);

    if (isBinary(buffer)) {
      throw new Error(`Cannot read binary file: ${params.path}`);
    }

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
