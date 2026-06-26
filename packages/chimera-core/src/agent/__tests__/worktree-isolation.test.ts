import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorktreeIsolation } from '../worktree-isolation.js';
import { execFile } from 'node:child_process';

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

    expect(info.branch).toBe('chimera-agent-test-age');
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
    expect(execFile).toHaveBeenCalledWith('git', ['add', '-u'], expect.any(Object), expect.any(Function));
    expect(execFile).toHaveBeenCalledWith('git', ['commit', '-m', 'Commit message'], expect.any(Object), expect.any(Function));
    expect(execFile).toHaveBeenCalledWith('git', ['merge', 'agent-branch'], expect.any(Object), expect.any(Function));
  });

  it('merges branch with stageAll parameter', async () => {
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

    const result = await isolation.mergeBranch(mockWorktree, 'Commit message', undefined, true);

    expect(result.success).toBe(true);
    expect(execFile).toHaveBeenCalledWith('git', ['add', '.'], expect.any(Object), expect.any(Function));
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
        cb({ code: 1 }, { stdout: '', stderr: 'CONFLICT' });
      } else if (args[0] === 'merge' && args[1] === '--abort') {
        cb(null, { stdout: '', stderr: '' });
      } else if (args[0] === 'status') {
        cb(null, { stdout: 'both modified: file.txt', stderr: '' });
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
    expect(result.conflict).toContain('both modified: file.txt');
    // Verify abort was attempted
    expect(execFile).toHaveBeenCalledWith('git', ['merge', '--abort'], expect.any(Object), expect.any(Function));
  });

});
