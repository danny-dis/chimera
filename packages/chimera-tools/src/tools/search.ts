import { z } from 'zod';
import { execa } from 'execa';
import path from 'path';
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
    const { stdout } = await execa('which', ['rg'], { reject: false });
    return stdout.trim() || null;
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
    const searchPath = params.path
      ? path.resolve(context.workspaceRoot, params.path)
      : context.workspaceRoot;

    const rgPath = await findRgPath();
    const command = rgPath ?? 'grep';

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
    } else {
      // Fallback to grep
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
      // Parse grep output: file:line:column:match
      const lines = stdout.split('\n').filter(Boolean);
      for (const line of lines) {
        const match = line.match(/^(.+?):(\d+):(\d+):(.*)$/);
        if (match) {
          const filePath = path.relative(context.workspaceRoot, match[1]);
          filesSearched.add(filePath);
          matches.push({
            file: filePath,
            line: parseInt(match[2], 10),
            column: parseInt(match[3], 10),
            match: match[4].trim(),
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
    const searchPath = params.path
      ? path.resolve(context.workspaceRoot, params.path)
      : context.workspaceRoot;

    const rgPath = await findRgPath();
    const command = rgPath ?? 'find';

    let stdout = '';

    try {
      if (command.endsWith('rg')) {
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
        stdout = result.stdout;
      } else {
        // Fallback: use find with -name
        const result = await execa('find', [
          searchPath,
          '-name', params.pattern,
        ], {
          timeout: 15_000,
          maxBuffer: MAX_OUTPUT_SIZE,
          reject: false,
        });
        stdout = result.stdout;
      }
    } catch {
      return { files: [], count: 0 };
    }

    const files = stdout
      .split('\n')
      .filter(Boolean)
      .map((f) => path.relative(context.workspaceRoot, f))
      .slice(0, 500);

    return { files, count: files.length };
  },
};
