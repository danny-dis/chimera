import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorktreeIsolation } from '../worktree-isolation.js';

// Real-git integration proof. Lives in its own file so it is NOT affected by
// the `vi.mock('node:child_process')` in worktree-isolation.test.ts (which
// would stub out the real `execFileSync` we need here). Exercises the actual
// `WorktreeIsolation` against a scratch git repo so a regression in real git
// behaviour — e.g. the branch-name collision bug — is caught. ponytail: gated
// on a git binary; skips rather than fails when unavailable.
describe('WorktreeIsolation real-git integration', () => {
  let hasGit = false;
  try {
    execFileSync('git', ['--version']);
    hasGit = true;
  } catch {
    hasGit = false;
  }

  const makeScratchRepo = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'chimera-wt-it-'));
    const repo = join(root, 'repo');
    execFileSync('git', ['init', repo]);
    execFileSync('git', ['config', 'user.email', 'p@x'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'p'], { cwd: repo });
    writeFileSync(join(repo, 'base.txt'), 'v1');
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: repo });
    return repo;
  };

  (hasGit ? it : it.skip)(
    'isolates edits and merges back; two concurrent agents never collide',
    async () => {
      const repo = makeScratchRepo();
      const iso = new WorktreeIsolation(repo);

      const wtA = await iso.createIsolatedWorktree('task-1');
      const wtB = await iso.createIsolatedWorktree('task-10'); // prefix-collides with task-1
      expect(wtA.branch).not.toBe(wtB.branch); // collision regression guard

      writeFileSync(join(wtA.worktreePath, 'a.txt'), 'A');
      writeFileSync(join(wtB.worktreePath, 'b.txt'), 'B');
      expect(existsSync(join(repo, 'a.txt'))).toBe(false);
      expect(existsSync(join(repo, 'b.txt'))).toBe(false);

      expect((await iso.mergeBranch(wtA, 'add a')).success).toBe(true);
      expect((await iso.mergeBranch(wtB, 'add b')).success).toBe(true);
      expect(existsSync(join(repo, 'a.txt'))).toBe(true);
      expect(existsSync(join(repo, 'b.txt'))).toBe(true);

      await iso.cleanupWorktree(wtA, false);
      await iso.cleanupWorktree(wtB, false);
      const list = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: repo, encoding: 'utf8' });
      expect(list).not.toContain(wtA.worktreePath);
      expect(list).not.toContain(wtB.worktreePath);
    },
    30000,
  );

  (hasGit ? it : it.skip)(
    'merge aborts and reports conflict on overlapping edit',
    async () => {
      const repo = makeScratchRepo();
      const iso = new WorktreeIsolation(repo);
      writeFileSync(join(repo, 'shared.txt'), 'host');
      execFileSync('git', ['add', '-A'], { cwd: repo });
      execFileSync('git', ['commit', '-m', 'host v1'], { cwd: repo });

      const wt = await iso.createIsolatedWorktree('proof-agent-4242');

      // Host advances on the SAME file BEFORE the worktree writes its own version.
      writeFileSync(join(repo, 'shared.txt'), 'host-wins');
      execFileSync('git', ['add', '-A'], { cwd: repo });
      execFileSync('git', ['commit', '-m', 'host v2'], { cwd: repo });

      writeFileSync(join(wt.worktreePath, 'shared.txt'), 'wt-wins');
      const r = await iso.mergeBranch(wt, 'wt change');
      expect(r.success).toBe(false);
      expect(r.conflict).toMatch(/CONFLICT|both modified/i);
      await iso.cleanupWorktree(wt, false);
    },
    30000,
  );
});
