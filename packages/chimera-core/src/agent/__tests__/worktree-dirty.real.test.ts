import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorktreeIsolation } from '../worktree-isolation.js';

it('detects unstaged, staged and untracked work before cleanup on real Git', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-dirty-owned-'));
  const repo = join(root, 'repo');
  const git = (args: string[], cwd = repo) => execFileSync('git', args, { cwd, stdio: 'ignore' });
  try {
    execFileSync('git', ['init', repo], { stdio: 'ignore' });
    git(['config', 'user.email', 'test@example.invalid']); git(['config', 'user.name', 'test']);
    writeFileSync(join(repo, 'base.txt'), 'base'); git(['add', 'base.txt']); git(['commit', '-m', 'base']);
    const isolation = new WorktreeIsolation(repo);
    const wt = await isolation.createIsolatedWorktree('dirty-proof');
    expect(await isolation.hasWorktreeChanges(wt.worktreePath, wt.headCommit)).toBe(false);
    writeFileSync(join(wt.worktreePath, 'base.txt'), 'changed');
    expect(await isolation.hasWorktreeChanges(wt.worktreePath, wt.headCommit)).toBe(true);
    git(['add', 'base.txt'], wt.worktreePath);
    expect(await isolation.hasWorktreeChanges(wt.worktreePath, wt.headCommit)).toBe(true);
    git(['restore', '--staged', 'base.txt'], wt.worktreePath); git(['restore', 'base.txt'], wt.worktreePath);
    writeFileSync(join(wt.worktreePath, 'new.txt'), 'valuable failed-task output');
    const dirty = await isolation.hasWorktreeChanges(wt.worktreePath, wt.headCommit);
    expect(dirty).toBe(true); await isolation.cleanupWorktree(wt, dirty);
    expect(existsSync(join(wt.worktreePath, 'new.txt'))).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 30000);
