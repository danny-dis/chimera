import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorktreeIsolation } from '../worktree-isolation.js';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

describe('WorktreeIsolation', () => {
  let isolation: WorktreeIsolation;
  const mockGitRoot = '/mock/repo';

  beforeEach(() => {
    vi.resetAllMocks();
    isolation = new WorktreeIsolation(mockGitRoot);
  });

  it('creates an isolated worktree', async () => {
    (execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: any) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
        cb(null, { stdout: mockGitRoot, stderr: '' });
      } else if (args[0] === 'worktree' && args[1] === 'add') {
        cb(null, { stdout: '', stderr: '' });
      } else if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
        cb(null, { stdout: 'abcdef123', stderr: '' });
      } else {
        cb(null, { stdout: '', stderr: '' });
      }
    });

    const info = await isolation.createIsolatedWorktree('test-agent-123');

    expect(info.branch.startsWith('chimera-agent-test-age-')).toBe(true);
    expect(info.headCommit).toBe('abcdef123');
    expect(execFile).toHaveBeenCalledWith('git', expect.arrayContaining(['worktree', 'add']), expect.any(Object), expect.any(Function));
  });

  it('detects changes in worktree', async () => {
    (execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: any) => {
      if (args[0] === 'diff' && args[1] === '--quiet') {
        // Simulate changes by returning exit code 1
        cb({ code: 1 });
      } else {
        cb(null, { stdout: '', stderr: '' });
      }
    });

    const hasChanges = await isolation.hasWorktreeChanges('/path/to/worktree', 'HEAD');
    expect(hasChanges).toBe(true);
  });

  it('merges branch successfully', async () => {
    (execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: any) => {
      if (args[0] === 'branch' && args[1] === '--show-current') {
        cb(null, { stdout: 'main', stderr: '' });
      } else if (args[0] === 'diff' && args[1] === '--cached' && args[2] === '--quiet') {
        // Simulate changes exist
        cb({ code: 1 });
      } else {
        cb(null, { stdout: '', stderr: '' });
      }
    });

    const mockWorktree = {
      worktreePath: '/mock/wt',
      branch: 'agent-branch',
      headCommit: 'old-commit',
      gitRoot: mockGitRoot,
    };

    const result = await isolation.mergeBranch(mockWorktree, 'Commit message');

    expect(result.success).toBe(true);
    expect(execFile).toHaveBeenCalledWith('git', ['add', '-A'], expect.any(Object), expect.any(Function));
    expect(execFile).toHaveBeenCalledWith('git', ['commit', '-m', 'Commit message'], expect.any(Object), expect.any(Function));
    expect(execFile).toHaveBeenCalledWith('git', ['merge', 'agent-branch'], expect.any(Object), expect.any(Function));
  });

  it('merges branch staging all files (incl. untracked)', async () => {
    (execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: any) => {
      if (args[0] === 'branch' && args[1] === '--show-current') {
        cb(null, { stdout: 'main', stderr: '' });
      } else if (args[0] === 'diff' && args[1] === '--cached' && args[2] === '--quiet') {
        cb({ code: 1 });
      } else {
        cb(null, { stdout: '', stderr: '' });
      }
    });

    const mockWorktree = {
      worktreePath: '/mock/wt',
      branch: 'agent-branch',
      headCommit: 'old-commit',
      gitRoot: mockGitRoot,
    };

    const result = await isolation.mergeBranch(mockWorktree, 'Commit message');

    expect(result.success).toBe(true);
    expect(execFile).toHaveBeenCalledWith('git', ['add', '-A'], expect.any(Object), expect.any(Function));
  });

  it('merges to explicit targetBranch when provided', async () => {
    (execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: any) => {
      if (args[0] === 'diff' && args[1] === '--cached' && args[2] === '--quiet') {
        cb({ code: 1 });
      } else {
        cb(null, { stdout: '', stderr: '' });
      }
    });

    const mockWorktree = {
      worktreePath: '/mock/wt',
      branch: 'agent-branch',
      headCommit: 'old-commit',
      gitRoot: mockGitRoot,
    };

    const result = await isolation.mergeBranch(mockWorktree, 'Commit message', 'develop');

    expect(result.success).toBe(true);
    expect(execFile).toHaveBeenCalledWith('git', ['merge', 'agent-branch'], expect.any(Object), expect.any(Function));
  });

  it('aborts merge on conflict and returns status', async () => {
    (execFile as any).mockImplementation((cmd: string, args: string[], opts: any, cb: any) => {
      if (args[0] === 'branch' && args[1] === '--show-current') {
        cb(null, { stdout: 'main', stderr: '' });
      } else if (args[0] === 'merge' && args[1] === 'agent-branch') {
        // ponytail: the conflict detail now comes from the merge's own error
        // (stderr). promisify(execFile) surfaces rejection as an Error with a
        // .stderr field, so reject with one rather than cb(err, {stdout,stderr}).
        const err = Object.assign(new Error('merge failed'), {
          code: 1,
          stdout: '',
          stderr: 'Auto-merging file.txt\nCONFLICT (content): Merge conflict in file.txt',
        });
        cb(err);
      } else if (args[0] === 'merge' && args[1] === '--abort') {
        cb(null, { stdout: '', stderr: '' });
      } else if (args[0] === 'diff' && args[1] === '--cached' && args[2] === '--quiet') {
        cb({ code: 1 });
      } else {
        cb(null, { stdout: '', stderr: '' });
      }
    });

    const mockWorktree = {
      worktreePath: '/mock/wt',
      branch: 'agent-branch',
      headCommit: 'old-commit',
      gitRoot: mockGitRoot,
    };

    const result = await isolation.mergeBranch(mockWorktree, 'Commit message');

    expect(result.success).toBe(false);
    expect(result.conflict).toContain('Merge conflict in file.txt');
    // Verify abort was attempted
    expect(execFile).toHaveBeenCalledWith('git', ['merge', '--abort'], expect.any(Object), expect.any(Function));
  });

});