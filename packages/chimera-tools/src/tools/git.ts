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

// ── Safety helpers for write tools ──────────────────────────────────────────

import fs from 'fs';

/**
 * Walk UP from the workspace root looking for an existing `.git`. Used by the
 * write tools to refuse operations that would resolve into a repo the user did
 * not intend (e.g. a stray `.git` in a parent home directory). Returns the
 * offending directory or null when the workspace is clear.
 */
function findParentGitDir(start: string): string | null {
  let dir = path.resolve(start);
  // Guard against infinite loop at filesystem root.
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ── git_init ────────────────────────────────────────────────────────────────

const GitInitReturnsSchema = z.object({
  initialized: z.boolean(),
  path: z.string(),
});

export const gitInitTool: ToolDefinition<z.ZodObject<{}>, typeof GitInitReturnsSchema> = {
  name: 'git_init',
  description:
    'Initialize a git repository in the current workspace. Refuses if a repo already ' +
    'exists in the workspace, and refuses if a .git is found in any parent directory ' +
    '(which would otherwise capture files outside the workspace).',
  parameters: z.object({}),
  returns: GitInitReturnsSchema,
  category: 'git',
  permissionLevel: 'write',
  execute: async (_params, context: ToolContext) => {
    const root = context.workspaceRoot;

    if (fs.existsSync(path.join(root, '.git'))) {
      throw new Error('A git repository already exists in the workspace; refusing to re-init.');
    }

    const parentRepo = findParentGitDir(path.dirname(root));
    if (parentRepo) {
      throw new Error(
        `Refusing: a .git exists in parent directory "${parentRepo}". Initializing here ` +
          'would create a nested repo that may capture files outside the workspace. ' +
          'Move the project or remove the parent repo first.',
      );
    }

    const result = await runGit(['init'], context);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to init repository: ${result.stderr}`);
    }
    return { initialized: true, path: root };
  },
};

// ── git_add ─────────────────────────────────────────────────────────────────

const GitAddParamsSchema = z.object({
  // Explicit list of files/paths to stage. Never accepts '.' or '-A'.
  files: z.array(z.string()).min(1, 'At least one file must be specified'),
});

const GitAddReturnsSchema = z.object({
  added: z.array(z.string()),
  count: z.number(),
});

export const gitAddTool: ToolDefinition<typeof GitAddParamsSchema, typeof GitAddReturnsSchema> = {
  name: 'git_add',
  description:
    "Stage specific files for commit. REQUIRES an explicit list of file paths — '.' and " +
    "'-A' are rejected on purpose (the harness mandates staging only intended files, never " +
    'the whole tree). Paths are resolved relative to the workspace root.',
  parameters: GitAddParamsSchema,
  returns: GitAddReturnsSchema,
  category: 'git',
  permissionLevel: 'write',
  execute: async (params, context: ToolContext) => {
    const rejected = params.files.filter((f) => f === '.' || f === '-A' || f === '--all');
    if (rejected.length > 0) {
      throw new Error(
        "Refusing to stage '.' or '-A'. Pass an explicit list of file paths to stage.",
      );
    }

    const added: string[] = [];
    for (const f of params.files) {
      const rel = f.replace(/\\/g, '/');
      const result = await runGit(['add', '--', rel], context);
      if (result.exitCode !== 0) {
        throw new Error(`Failed to add "${rel}": ${result.stderr}`);
      }
      added.push(rel);
    }
    return { added, count: added.length };
  },
};

// ── git_commit ──────────────────────────────────────────────────────────────

const GitCommitParamsSchema = z.object({
  message: z.string().min(1, 'Commit message is required'),
  // Optional author override; falls back to repo/global git config when omitted.
  authorName: z.string().optional(),
  authorEmail: z.string().optional(),
});

const GitCommitReturnsSchema = z.object({
  committed: z.boolean(),
  hash: z.string().optional(),
  message: z.string(),
});

export const gitCommitTool: ToolDefinition<typeof GitCommitParamsSchema, typeof GitCommitReturnsSchema> = {
  name: 'git_commit',
  description:
    'Create a commit from the currently staged files. Requires a message and refuses to ' +
    'run with nothing staged (to avoid committing unintended changes). Author name/email ' +
    'may be supplied; otherwise git uses the repo or global config.',
  parameters: GitCommitParamsSchema,
  returns: GitCommitReturnsSchema,
  category: 'git',
  permissionLevel: 'write',
  execute: async (params, context: ToolContext) => {
    // Refuse if nothing is staged.
    const stagedCheck = await runGit(['diff', '--cached', '--name-only'], context);
    if (!stagedCheck.stdout.trim()) {
      throw new Error(
        'Nothing staged to commit. Call git_add with explicit files first.',
      );
    }

    const args = ['commit', '-m', params.message];
    if (params.authorName && params.authorEmail) {
      args.push('--author', `${params.authorName} <${params.authorEmail}>`);
    }
    const result = await runGit(args, context);
    if (result.exitCode !== 0) {
      throw new Error(`Commit failed: ${result.stderr || result.stdout}`);
    }

    const hashResult = await runGit(['rev-parse', 'HEAD'], context);
    return {
      committed: true,
      hash: hashResult.stdout.trim() || undefined,
      message: params.message,
    };
  },
};

// ── git_push ────────────────────────────────────────────────────────────────

const GitPushParamsSchema = z.object({
  remote: z.string().min(1, 'Remote name is required (e.g. "origin")'),
  branch: z.string().min(1, 'Branch name is required'),
  setUpstream: z.boolean().default(false),
});

const GitPushReturnsSchema = z.object({
  pushed: z.boolean(),
  remote: z.string(),
  branch: z.string(),
});

export const gitPushTool: ToolDefinition<typeof GitPushParamsSchema, typeof GitPushReturnsSchema> = {
  name: 'git_push',
  description:
    'Push the current branch to a remote. Requires explicit remote and branch names ' +
    '(never assumes "origin"). Mark setUpstream to set tracking. Destructive/network ' +
    'operation gated at the "dangerous" permission level.',
  parameters: GitPushParamsSchema,
  returns: GitPushReturnsSchema,
  category: 'git',
  permissionLevel: 'dangerous',
  execute: async (params, context: ToolContext) => {
    const args = ['push'];
    if (params.setUpstream) args.push('-u');
    args.push(params.remote, params.branch);

    const result = await runGit(args, context);
    if (result.exitCode !== 0) {
      throw new Error(`Push failed: ${result.stderr || result.stdout}`);
    }
    return { pushed: true, remote: params.remote, branch: params.branch };
  },
};
