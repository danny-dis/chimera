/**
 * @chimera/isolation — WorktreeProvider unit tests
 *
 * Tests the non-I/O surface of the provider: branch-name generation,
 * worktree-path computation, getWorktreePath with overrides, and the
 * generateBranchName exhaustive switch.
 *
 * The full I/O surface (create / destroy / list) is exercised by the
 * manual end-to-end test in the plan's verification section — git
 * subprocess mocking in vitest is fragile and the ROI is low for a
 * leaf utility.
 *
 * Path-separator portability: assertions use the last 3 path segments
 * with `.replace(/\\/g, '/')` so tests pass on both POSIX and Windows.
 */

import { describe, expect, it } from 'vitest';

import { WorktreeProvider } from '../providers/worktree.js';
import { toRepoPath } from '../types/branded.js';
import type { TaskIsolationRequest } from '../types.js';

function makeRequest(overrides: Partial<TaskIsolationRequest> = {}): TaskIsolationRequest {
  return {
    workflowType: 'task',
    canonicalRepoPath: toRepoPath('/home/user/myrepo'),
    identifier: 'implement-foo-bar',
    ...overrides,
  };
}

/** Normalize a path to forward slashes for cross-platform assertions. */
function posix(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Last N path segments of a posix-normalized path. */
function tail(p: string, n: number): string {
  return posix(p).split('/').filter(Boolean).slice(-n).join('/');
}

describe('WorktreeProvider — generateBranchName', () => {
  const provider = new WorktreeProvider();

  it('produces chimera/task-<slug> for task requests', () => {
    const branch = provider.generateBranchName(makeRequest({ identifier: 'Add Auth' }));
    expect(branch).toBe('chimera/task-add-auth');
  });

  it('slugifies identifiers with punctuation', () => {
    const branch = provider.generateBranchName(
      makeRequest({ identifier: 'Fix login flow!!!' })
    );
    expect(branch).toBe('chimera/task-fix-login-flow');
  });

  it('handles short identifiers', () => {
    const branch = provider.generateBranchName(makeRequest({ identifier: 'X' }));
    expect(branch).toBe('chimera/task-x');
  });

  it('caps the slug portion at 50 chars', () => {
    const longId = 'a'.repeat(200);
    const branch = provider.generateBranchName(makeRequest({ identifier: longId }));
    expect(branch.length).toBe('chimera/task-'.length + 50);
  });
});

describe('WorktreeProvider — getWorktreePath', () => {
  const provider = new WorktreeProvider();
  const repoPath = '/home/user/myrepo';

  it('uses .chimera-worktrees/<branch> by default', () => {
    const p = provider.getWorktreePath(makeRequest(), 'chimera/task-foo');
    expect(tail(p, 4)).toBe('myrepo/.chimera-worktrees/chimera/task-foo');
    expect(posix(p).endsWith('.chimera-worktrees/chimera/task-foo')).toBe(true);
  });

  it('honors a per-repo path override (relative)', () => {
    const p = provider.getWorktreePath(makeRequest(), 'chimera/task-foo', {
      path: '.worktrees',
    });
    expect(tail(p, 4)).toBe('myrepo/.worktrees/chimera/task-foo');
    expect(posix(p).endsWith('.worktrees/chimera/task-foo')).toBe(true);
  });

  it('uses the same repo root as a prefix', () => {
    // Sanity: when no override, the path is rooted at the canonical repo.
    const p = provider.getWorktreePath(makeRequest(), 'chimera/task-foo');
    expect(posix(p).startsWith(posix(repoPath))).toBe(true);
  });

  it('throws on absolute path override', () => {
    expect(() =>
      provider.getWorktreePath(makeRequest(), 'chimera/task-foo', {
        path: '/tmp/worktrees',
      })
    ).toThrow(/absolute/);
  });

  it('throws on `..` escape in path override', () => {
    expect(() =>
      provider.getWorktreePath(makeRequest(), 'chimera/task-foo', {
        path: '../escape',
      })
    ).toThrow(/within the repo/);
  });

  it('ignores null config (uses default layout)', () => {
    const p = provider.getWorktreePath(makeRequest(), 'chimera/task-foo', null);
    expect(posix(p).endsWith('.chimera-worktrees/chimera/task-foo')).toBe(true);
  });
});

describe('WorktreeProvider — providerType', () => {
  it('declares itself as a worktree provider', () => {
    const provider = new WorktreeProvider();
    expect(provider.providerType).toBe('worktree');
  });
});

