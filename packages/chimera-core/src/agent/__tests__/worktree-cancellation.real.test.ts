import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorktreeIsolation, type WorktreeInfo } from '../worktree-isolation.js';

it('reports allocation before creating a worktree and honors cancellation there', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-wt-cancel-'));
  const repo = join(root, 'repo');
  let allocation: WorktreeInfo | undefined;
  try {
    execFileSync('git', ['init', repo]);
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '--allow-empty', '-m', 'fixture'], { cwd: repo });
    const controller = new AbortController();
    const isolation = new WorktreeIsolation(repo);
    await expect(isolation.createIsolatedWorktree('cancel', {
      signal: controller.signal,
      onAllocated: info => {
        allocation = info;
        expect(existsSync(info.worktreePath)).toBe(false);
        controller.abort(new Error('cancelled at allocation'));
      },
    })).rejects.toThrow(/cancelled at allocation/);
    expect(allocation?.headCommit).toMatch(/^[a-f0-9]{40,64}$/);
    expect(existsSync(allocation!.worktreePath)).toBe(false);
    const branches = execFileSync('git', ['branch', '--list'], { cwd: repo, encoding: 'utf8' });
    expect(branches).not.toContain(allocation!.branch);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);
