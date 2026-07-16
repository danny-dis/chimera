import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import type { ToolDefinition, ToolContext } from '../tool-schema.js';

// ── find_folder ────────────────────────────────────────────────────────────
// Locates a directory *by its name* (glob or substring) under a search root.
// The content-search tools (search_files / glob_files) can only match file
// contents / file names — they cannot answer "where is the folder called X".
// That gap is what made "find this folder and cd into it" fail no matter how
// many times the user spelled out the path.

const FindFolderParamsSchema = z.object({
  name: z.string().min(1, 'Folder name must not be empty'),
  path: z.string().optional().describe('Search root. Defaults to workspaceRoot. Accepts absolute paths.'),
  maxResults: z.number().int().positive().default(50),
  depth: z.number().int().positive().default(8),
  caseSensitive: z.boolean().default(false),
});

const FindFolderReturnsSchema = z.object({
  folders: z.array(z.string()),
  count: z.number(),
  searched: z.string(),
});

// Dirs we skip by default to keep scans bounded (ponytail: drop whole-subtree
// scan of dependency/metadata dirs; revisit if a user genuinely needs them).
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'target', '__pycache__']);

function matchName(basename: string, pattern: string, caseSensitive: boolean): boolean {
  const a = caseSensitive ? basename : basename.toLowerCase();
  const b = caseSensitive ? pattern : pattern.toLowerCase();
  if (pattern.includes('*') || pattern.includes('?')) {
    const regex = new RegExp(
      '^' +
        b
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$',
    );
    return regex.test(a);
  }
  return a.includes(b);
}

export const findFolderTool: ToolDefinition<typeof FindFolderParamsSchema, typeof FindFolderReturnsSchema> = {
  name: 'find_folder',
  description: 'Find directories by name (glob or substring) under a search root. Use this to locate a folder before navigating into it.',
  parameters: FindFolderParamsSchema,
  returns: FindFolderReturnsSchema,
  category: 'search',
  permissionLevel: 'read',
  execute: async (params, context: ToolContext) => {
    params = FindFolderParamsSchema.parse(params);

    const searchRoot = params.path
      ? path.isAbsolute(params.path)
        ? path.resolve(params.path)
        : path.resolve(context.workspaceRoot, params.path)
      : path.resolve(context.workspaceRoot);

    const found: string[] = [];
    const seen = new Set<string>();

    async function walk(dir: string, currentDepth: number): Promise<void> {
      if (found.length >= params.maxResults) return;
      if (currentDepth > params.depth) return;

      let entries: import('fs').Dirent[];
      try {
        const real = await fs.realpath(dir).catch(() => dir);
        if (seen.has(real)) return;
        seen.add(real);
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // inaccessible dir
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const full = path.join(dir, entry.name);

        if (matchName(entry.name, params.name, params.caseSensitive)) {
          found.push(full);
          if (found.length >= params.maxResults) return;
        }

        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full, currentDepth + 1);
      }
    }

    await walk(searchRoot, 0);

    return { folders: found, count: found.length, searched: searchRoot };
  },
};
