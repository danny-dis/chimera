import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync('git', args, { cwd });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

async function gitExitCode(args: string[], cwd?: string): Promise<number> {
  try {
    await execFileAsync('git', args, { cwd });
    return 0;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      return (err as { code: number }).code;
    }
    return 1;
  }
}

export interface WorktreeInfo {
  worktreePath: string;
  branch: string;
  headCommit: string;
  gitRoot: string;
}

export class WorktreeIsolation {
  private readonly worktreesDir: string;

  constructor(gitRoot?: string) {
    this.worktreesDir = resolve(gitRoot ?? process.cwd(), '.chimera-worktrees');
  }

  async createIsolatedWorktree(agentId: string): Promise<WorktreeInfo> {
    const slug = agentId.slice(0, 8);
    const branch = `chimera-agent-${slug}`;
    const worktreePath = resolve(this.worktreesDir, `agent-${slug}`);

    const { stdout: gitRoot } = await git(['rev-parse', '--show-toplevel']);

    await git(['worktree', 'add', worktreePath, '-b', branch], gitRoot);

    const { stdout: headCommit } = await git(['rev-parse', 'HEAD'], worktreePath);

    return { worktreePath, branch, headCommit, gitRoot };
  }

  async cleanupWorktree(worktree: WorktreeInfo, hasChanges: boolean): Promise<void> {
    if (hasChanges) {
      console.log(
        `Worktree ${worktree.worktreePath} has uncommitted changes; skipping removal.`,
      );
      return;
    }

    await git(['worktree', 'remove', '--force', worktree.worktreePath], worktree.gitRoot);
    await git(['branch', '-D', worktree.branch], worktree.gitRoot);
  }

  async hasWorktreeChanges(worktreePath: string, sinceCommit: string): Promise<boolean> {
    const code = await gitExitCode(['diff', '--quiet', sinceCommit, 'HEAD'], worktreePath);
    return code !== 0;
  }
}
