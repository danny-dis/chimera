import { z } from 'zod';
import { execa } from 'execa';
import path from 'path';
import type { ToolDefinition, ToolContext } from '../tool-schema.js';
import { GitFileStatusSchema, GitCommitSchema, MAX_OUTPUT_SIZE } from '../tool-schema.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function runGit(
  args: string[],
  context: ToolContext,
  cwd?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const workingDir = cwd
    ? path.resolve(context.workspaceRoot, cwd)
    : context.workspaceRoot;

  const result = await execa('git', args, {
    cwd: workingDir,
    timeout: 30_000,
    maxBuffer: MAX_OUTPUT_SIZE,
    reject: false,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 0,
  };
}

// ── git_status ───────────────────────────────────────────────────────────────

const GitStatusParamsSchema = z.object({
  path: z.string().optional(),
});

const GitStatusReturnsSchema = z.object({
  branch: z.string(),
  ahead: z.number(),
  behind: z.number(),
  staged: z.array(GitFileStatusSchema),
  unstaged: z.array(GitFileStatusSchema),
  untracked: z.array(z.string()),
});

export const gitStatusTool: ToolDefinition<typeof GitStatusParamsSchema, typeof GitStatusReturnsSchema> = {
  name: 'git_status',
  description: 'Get current git status including branch, ahead/behind, and file changes',
  parameters: GitStatusParamsSchema,
  returns: GitStatusReturnsSchema,
  category: 'git',
  permissionLevel: 'read',
  execute: async (params, context: ToolContext) => {
    const cwd = params.path;

    // Get current branch
    const branchResult = await runGit(['branch', '--show-current'], context, cwd);
    const branch = branchResult.stdout.trim() || 'HEAD (detached)';

    // Get ahead/behind
    let ahead = 0;
    let behind = 0;
    const trackingResult = await runGit(
      ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
      context,
      cwd,
    );
    if (trackingResult.exitCode === 0) {
      const [beh, ahe] = trackingResult.stdout.trim().split('\t').map(Number);
      ahead = ahe ?? 0;
      behind = beh ?? 0;
    }

    // Get staged changes
    const stagedResult = await runGit(['diff', '--cached', '--name-status'], context, cwd);
    const staged: Array<z.infer<typeof GitFileStatusSchema>> = [];
    if (stagedResult.stdout.trim()) {
      for (const line of stagedResult.stdout.trim().split('\n')) {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          staged.push({ path: parts[1], status: parts[0], staged: true });
        }
      }
    }

    // Get unstaged changes
    const unstagedResult = await runGit(['diff', '--name-status'], context, cwd);
    const unstaged: Array<z.infer<typeof GitFileStatusSchema>> = [];
    if (unstagedResult.stdout.trim()) {
      for (const line of unstagedResult.stdout.trim().split('\n')) {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          unstaged.push({ path: parts[1], status: parts[0], staged: false });
        }
      }
    }

    // Get untracked files
    const untrackedResult = await runGit(['ls-files', '--others', '--exclude-standard'], context, cwd);
    const untracked = untrackedResult.stdout.trim()
      ? untrackedResult.stdout.trim().split('\n')
      : [];

    return { branch, ahead, behind, staged, unstaged, untracked };
  },
};

// ── git_diff ─────────────────────────────────────────────────────────────────

const GitDiffParamsSchema = z.object({
  path: z.string().optional(),
  staged: z.boolean().default(false),
  uncommitted: z.boolean().default(true),
  commitRange: z.string().optional(),
});

const GitDiffReturnsSchema = z.object({
  diff: z.string(),
  filesChanged: z.number(),
  insertions: z.number(),
  deletions: z.number(),
});

export const gitDiffTool: ToolDefinition<typeof GitDiffParamsSchema, typeof GitDiffReturnsSchema> = {
  name: 'git_diff',
  description: 'Show git diffs for staged, unstaged, or a commit range',
  parameters: GitDiffParamsSchema,
  returns: GitDiffReturnsSchema,
  category: 'git',
  permissionLevel: 'read',
  execute: async (params, context: ToolContext) => {
    const args: string[] = ['diff'];

    if (params.staged) {
      args.push('--cached');
    }

    if (params.commitRange) {
      args.push(params.commitRange);
    }

    if (params.path) {
      args.push('--', params.path);
    }

    const diffResult = await runGit(args, context);
    const diff = diffResult.stdout;

    // Count stats
    const statArgs = ['diff', '--stat'];
    if (params.staged) statArgs.push('--cached');
    if (params.commitRange) statArgs.push(params.commitRange);
    if (params.path) statArgs.push('--', params.path);

    const statResult = await runGit(statArgs, context);

    const filesChanged = statResult.stdout.trim()
      ? parseInt(statResult.stdout.split('\n').pop()?.trim()?.match(/(\d+) file/)?.[1] ?? '0', 10)
      : 0;

    // Parse insertions/deletions from --numstat
    const numstatArgs = ['diff', '--numstat'];
    if (params.staged) numstatArgs.push('--cached');
    if (params.commitRange) numstatArgs.push(params.commitRange);
    if (params.path) numstatArgs.push('--', params.path);

    const numstatResult = await runGit(numstatArgs, context);
    let insertions = 0;
    let deletions = 0;

    if (numstatResult.stdout.trim()) {
      for (const line of numstatResult.stdout.trim().split('\n')) {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          const ins = parseInt(parts[0], 10);
          const del = parseInt(parts[1], 10);
          if (!isNaN(ins)) insertions += ins;
          if (!isNaN(del)) deletions += del;
        }
      }
    }

    return { diff, filesChanged, insertions, deletions };
  },
};

// ── git_log ──────────────────────────────────────────────────────────────────

const GitLogParamsSchema = z.object({
  maxCommits: z.number().int().positive().default(20),
  path: z.string().optional(),
  author: z.string().optional(),
  since: z.string().optional(),
});

const GitLogReturnsSchema = z.object({
  commits: z.array(GitCommitSchema),
  total: z.number(),
});

export const gitLogTool: ToolDefinition<typeof GitLogParamsSchema, typeof GitLogReturnsSchema> = {
  name: 'git_log',
  description: 'View commit history with optional filtering',
  parameters: GitLogParamsSchema,
  returns: GitLogReturnsSchema,
  category: 'git',
  permissionLevel: 'read',
  execute: async (rawParams, context: ToolContext) => {
    // Apply Zod defaults so direct callers (e.g. tests) get the same
    // behavior as the registry, which already runs `parse()`.
    const params = GitLogParamsSchema.parse(rawParams);
    const args: string[] = [
      'log',
      `--max-count=${params.maxCommits}`,
      '--format=%H|%h|%an|%ai|%s',
    ];

    if (params.author) {
      args.push(`--author=${params.author}`);
    }
    if (params.since) {
      args.push(`--since=${params.since}`);
    }
    if (params.path) {
      args.push('--', params.path);
    }

    const result = await runGit(args, context);
    const commits: Array<z.infer<typeof GitCommitSchema>> = [];

    if (result.stdout.trim()) {
      for (const line of result.stdout.trim().split('\n')) {
        const parts = line.split('|');
        if (parts.length >= 5) {
          commits.push({
            hash: parts[0],
            shortHash: parts[1],
            author: parts[2],
            date: parts[3],
            message: parts.slice(4).join('|'),
            files: [],
          });
        }
      }
    }

    // Get files per commit (batch for performance).
    // `git show --pretty=format: --name-only <hash>` is used instead of
    // `git diff-tree`, which returns no output for root commits on some
    // git versions (notably Windows Git forges with empty initial trees).
    for (const commit of commits) {
      const filesResult = await runGit(
        ['show', '--pretty=format:', '--name-only', commit.hash],
        context,
      );
      if (filesResult.stdout.trim()) {
        commit.files = filesResult.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
      }
    }

    return { commits, total: commits.length };
  },
};

// ── git_branch ───────────────────────────────────────────────────────────────

const GitBranchParamsSchema = z.object({
  action: z.enum(['list', 'create', 'delete', 'checkout']),
  name: z.string().optional(),
  base: z.string().optional(),
});

const GitBranchReturnsSchema = z.object({
  branch: z.string(),
  created: z.boolean().optional(),
  deleted: z.boolean().optional(),
});

export const gitBranchTool: ToolDefinition<typeof GitBranchParamsSchema, typeof GitBranchReturnsSchema> = {
  name: 'git_branch',
  description: 'List, create, delete, or checkout git branches',
  parameters: GitBranchParamsSchema,
  returns: GitBranchReturnsSchema,
  category: 'git',
  permissionLevel: 'write',
  execute: async (params, context: ToolContext) => {
    switch (params.action) {
      case 'list': {
        const result = await runGit(['branch', '--format=%(refname:short)'], context);
        const branches = result.stdout.trim().split('\n').filter(Boolean);
        return { branch: branches.join('\n') };
      }

      case 'create': {
        if (!params.name) throw new Error('Branch name is required for create action');
        const args = ['branch', params.name];
        if (params.base) args.push(params.base);
        const result = await runGit(args, context);
        if (result.exitCode !== 0) {
          throw new Error(`Failed to create branch: ${result.stderr}`);
        }
        return { branch: params.name, created: true };
      }

      case 'delete': {
        if (!params.name) throw new Error('Branch name is required for delete action');
        const result = await runGit(['branch', '-D', params.name], context);
        if (result.exitCode !== 0) {
          throw new Error(`Failed to delete branch: ${result.stderr}`);
        }
        return { branch: params.name, deleted: true };
      }

      case 'checkout': {
        if (!params.name) throw new Error('Branch name is required for checkout action');
        const args = ['checkout'];
        if (params.base) {
          args.push('-b', params.name, params.base);
        } else {
          args.push(params.name);
        }
        const result = await runGit(args, context);
        if (result.exitCode !== 0) {
          throw new Error(`Failed to checkout branch: ${result.stderr}`);
        }
        return { branch: params.name };
      }
    }
  },
};
