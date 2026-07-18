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
  private readonly gitRoot: string;

  constructor(gitRoot?: string) {
    // ponytail: worktrees MUST live OUTSIDE the main repo's working tree.
    // The old default `<gitRoot>/.chimera-worktrees` put them inside the
    // tracked tree, so `git add -A` in a worktree staged the *embedded
    // sibling worktree dir* (a nested git repo) instead of the agent's files
    // → "nothing to commit". Placing them as a sibling of the repo avoids
    // that and keeps them out of the main checkout's status/merge.
    this.gitRoot = resolve(gitRoot ?? process.cwd());
    this.worktreesDir = resolve(this.gitRoot, '..', '.chimera-worktrees');
  }

  async createIsolatedWorktree(agentId: string): Promise<WorktreeInfo> {
    const slug = agentId.slice(0, 8);
    // ponytail: agentId is truncated to 8 chars for the branch name, so two
    // concurrent agents whose ids share a prefix (e.g. `task-1` / `task-10`,
    // or `trio-<ms>` within the same millisecond) collided on the SAME branch
    // and `git worktree add -b` failed with "a branch named ... already
    // exists". Append a process+time+random suffix to guarantee uniqueness
    // while keeping the human-readable slug. Upgrade path: pass an explicit
    // unique id from the caller if collision-proof naming is ever required.
    const suffix = `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const branch = `chimera-agent-${slug}-${suffix}`;
    const worktreePath = resolve(this.worktreesDir, `agent-${slug}-${suffix}`);

    // Use the gitRoot captured at construction time. The old code re-ran
    // `git rev-parse --show-toplevel` with NO cwd, which resolved from the
    // process CWD — so the worktree was created against whatever repo the
    // process happened to be in, not the configured one. Root-cause fix:
    // never re-derive; trust the injected root.
    const gitRoot = this.gitRoot;

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

  async mergeBranch(
    worktree: WorktreeInfo,
    commitMessage: string,
    targetBranch?: string,
  ): Promise<{ success: boolean; conflict?: string }> {
    // ponytail: stage ALL (incl. untracked) — an isolated agent branch must
    // capture newly created files, not just edits to tracked ones. The old
    // `add -u` default silently committed nothing for brand-new files, so a
    // writer that only CREATED files produced an empty merge. `add -A` is the
    // correct default for a throwaway per-agent branch. Removed the dead
    // `stageAll` flag (one value, never varied in any caller).
    await git(['add', '-A'], worktree.worktreePath);
    await git(['commit', '-m', commitMessage], worktree.worktreePath);

    const branch = targetBranch ?? (await git(['branch', '--show-current'], worktree.gitRoot)).stdout;

    try {
      await git(['merge', worktree.branch], worktree.gitRoot);
      return { success: true };
    } catch (e: any) {
      // ponytail: capture the MERGE's own error (it contains the conflict
      // detail, e.g. "CONFLICT (content): Merge conflict in x.txt"). Reading
      // `git status` AFTER `merge --abort` returns a clean tree and silently
      // drops the conflict info — callers need to know WHY it failed.
      const conflictDetail =
        [e?.stderr, e?.stdout].filter(Boolean).join('\n').trim() ||
        (e instanceof Error ? e.message : String(e));
      await git(['merge', '--abort'], worktree.gitRoot);
      return { success: false, conflict: conflictDetail };
    }
  }

  async hasWorktreeChanges(worktreePath: string, sinceCommit: string): Promise<boolean> {
    const code = await gitExitCode(['diff', '--quiet', sinceCommit, 'HEAD'], worktreePath);
    return code !== 0;
  }
}
