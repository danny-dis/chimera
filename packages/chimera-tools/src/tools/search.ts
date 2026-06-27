import { z } from 'zod';
import { execa } from 'execa';
import path from 'path';
import { readdir } from 'fs/promises';
import type { ToolDefinition, ToolContext } from '../tool-schema.js';
import { SearchMatchSchema, MAX_OUTPUT_SIZE } from '../tool-schema.js';

// ── search_files ─────────────────────────────────────────────────────────────

const SearchFilesParamsSchema = z.object({
  pattern: z.string().min(1, 'Pattern must not be empty'),
  path: z.string().optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  caseSensitive: z.boolean().default(false),
  maxResults: z.number().int().positive().default(100),
});

const SearchFilesReturnsSchema = z.object({
  matches: z.array(SearchMatchSchema),
  totalMatches: z.number(),
  filesSearched: z.number(),
});

async function findRgPath(): Promise<string | null> {
  try {
    const result = await execa('rg', ['--version'], { reject: false, timeout: 3000 });
    return result.exitCode === 0 ? 'rg' : null;
  } catch {
    return null;
  }
}

export const searchFilesTool: ToolDefinition<typeof SearchFilesParamsSchema, typeof SearchFilesReturnsSchema> = {
  name: 'search_files',
  description: 'Search file contents using ripgrep (rg) with gitignore support',
  parameters: SearchFilesParamsSchema,
  returns: SearchFilesReturnsSchema,
  category: 'search',
  permissionLevel: 'read',
  execute: async (params, context: ToolContext) => {
    // Apply zod defaults (maxResults, caseSensitive) — callers may invoke
    // the tool directly without going through ToolRegistry validation.
    params = SearchFilesParamsSchema.parse(params);

    const searchPath = params.path
      ? path.resolve(context.workspaceRoot, params.path)
      : context.workspaceRoot;

    const rgPath = await findRgPath();
    const isWindows = process.platform === 'win32';
    const command = rgPath ?? (isWindows ? 'findstr' : 'grep');

    const args: string[] = [];

    if (command.endsWith('rg')) {
      args.push(
        '--json',
        '--no-heading',
        '--line-number',
        '--column',
        '--max-count', String(params.maxResults),
      );
      if (params.caseSensitive) {
        args.push('--case-sensitive');
      } else {
        args.push('--ignore-case');
      }
      if (params.include?.length) {
        for (const glob of params.include) {
          args.push('--glob', glob);
        }
      }
      if (params.exclude?.length) {
        for (const glob of params.exclude) {
          args.push('--glob', `!${glob}`);
        }
      }
      args.push('--', params.pattern, searchPath);
    } else if (isWindows) {
      // Windows fallback: findstr /s /n
      args.push('/s', '/n');
      if (!params.caseSensitive) args.push('/i');
      args.push(params.pattern, path.join(searchPath, '*'));
    } else {
      // Unix fallback: grep
      args.push('-rn');
      if (params.caseSensitive) {
        args.push('--fixed-strings');
      } else {
        args.push('-i');
      }
      args.push(params.pattern, searchPath);
    }

    let stdout = '';
    let exitCode = 0;

    try {
      const result = await execa(command, args, {
        cwd: context.workspaceRoot,
        timeout: 30_000,
        maxBuffer: MAX_OUTPUT_SIZE,
        reject: false,
      });
      stdout = result.stdout;
      exitCode = result.exitCode ?? 0;
    } catch {
      // Timeout or other error — return what we have
    }

    // grep returns 1 when no match (not an error)
    if (exitCode > 1) {
      return { matches: [], totalMatches: 0, filesSearched: 0 };
    }

    const matches: Array<z.infer<typeof SearchMatchSchema>> = [];
    const filesSearched = new Set<string>();

    if (command.endsWith('rg')) {
      // Parse JSON lines output from ripgrep
      const lines = stdout.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'match') {
            const data = parsed.data;
            const match: z.infer<typeof SearchMatchSchema> = {
              file: path.relative(context.workspaceRoot, data.path.text),
              line: data.line_number,
              column: data.submatches[0]?.start ?? 0,
              match: data.lines.text.trim(),
            };
            matches.push(match);
            filesSearched.add(match.file);
          } else if (parsed.type === 'begin') {
            filesSearched.add(path.relative(context.workspaceRoot, parsed.data.path.text));
          }
        } catch {
          // Skip unparseable lines
        }
      }
    } else {
      // Parse grep/findstr output: file:line:column:match or findstr format
      const lines = stdout.split('\n').filter(Boolean);
      for (const line of lines) {
        // Try standard grep format: file:line:column:match
        const grepMatch = line.match(/^(.+?):(\d+):(\d+):(.*)$/);
        if (grepMatch) {
          const filePath = path.relative(context.workspaceRoot, grepMatch[1]);
          filesSearched.add(filePath);
          matches.push({
            file: filePath,
            line: parseInt(grepMatch[2], 10),
            column: parseInt(grepMatch[3], 10),
            match: grepMatch[4].trim(),
          });
          continue;
        }
        // Try findstr format: file:line:match (no column)
        const findstrMatch = line.match(/^(.+?):(\d+):(.*)$/);
        if (findstrMatch) {
          const filePath = path.relative(context.workspaceRoot, findstrMatch[1]);
          filesSearched.add(filePath);
          matches.push({
            file: filePath,
            line: parseInt(findstrMatch[2], 10),
            column: 0,
            match: findstrMatch[3].trim(),
          });
        }
      }
    }

    return {
      matches: matches.slice(0, params.maxResults),
      totalMatches: matches.length,
      filesSearched: filesSearched.size,
    };
  },
};

// ── glob_files ───────────────────────────────────────────────────────────────

const GlobFilesParamsSchema = z.object({
  pattern: z.string().min(1, 'Pattern must not be empty'),
  path: z.string().optional(),
});

const GlobFilesReturnsSchema = z.object({
  files: z.array(z.string()),
  count: z.number(),
});

export const globFilesTool: ToolDefinition<typeof GlobFilesParamsSchema, typeof GlobFilesReturnsSchema> = {
  name: 'glob_files',
  description: 'Match files using glob patterns',
  parameters: GlobFilesParamsSchema,
  returns: GlobFilesReturnsSchema,
  category: 'search',
  permissionLevel: 'read',
  execute: async (params, context: ToolContext) => {
    params = GlobFilesParamsSchema.parse(params);
    const searchPath = params.path
      ? path.resolve(context.workspaceRoot, params.path)
      : context.workspaceRoot;

    const rgPath = await findRgPath();

    let files: string[] = [];

    if (rgPath) {
      try {
        const result = await execa('rg', [
          '--files',
          '--glob', params.pattern,
          searchPath,
        ], {
          cwd: context.workspaceRoot,
          timeout: 15_000,
          maxBuffer: MAX_OUTPUT_SIZE,
          reject: false,
        });
        files = result.stdout
          .split('\n')
          .filter(Boolean)
          .map((f) => path.relative(context.workspaceRoot, f));
      } catch {
        files = [];
      }
    } else {
      // Cross-platform fallback: recursive readdir with simple glob matching
      const pattern = params.pattern;
      const regex = new RegExp(
        '^' +
          pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.') +
          '$'
      );

      async function walk(dir: string): Promise<string[]> {
        const results: string[] = [];
        try {
          const entries = await readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              results.push(...await walk(fullPath));
            } else if (entry.isFile() && regex.test(entry.name)) {
              results.push(path.relative(context.workspaceRoot, fullPath));
            }
          }
        } catch { /* skip inaccessible dirs */ }
        return results;
      }

      files = (await walk(searchPath)).slice(0, 500);
    }

    return { files, count: files.length };
  },
};
