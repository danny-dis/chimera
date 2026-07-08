import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execa } from 'execa';
import { gitStatusTool, gitDiffTool, gitLogTool, gitBranchTool, gitInitTool, gitAddTool, gitCommitTool } from '../tools/git.js';
import type { ToolContext } from '../tool-schema.js';
import { EventStream } from '@chimera/core';

let workspaceRoot: string;

function makeContext(): ToolContext {
  return {
    workspaceRoot,
    sessionId: 'test-session',
    eventStream: new EventStream(),
    costTracker: {
      setBudget: () => {},
      recordSpend: () => {},
      getSpend: () => 0,
      getRemaining: () => Infinity,
    } as any,
    permissionCheck: () => 'allow',
  };
}

async function initGitRepo(dir: string) {
  await execa('git', ['init'], { cwd: dir });
  await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  await execa('git', ['config', 'user.name', 'Test User'], { cwd: dir });
}

async function createCommit(dir: string, message: string, filename: string, content: string) {
  await fs.writeFile(path.join(dir, filename), content);
  await execa('git', ['add', '.'], { cwd: dir });
  await execa('git', ['commit', '-m', message], { cwd: dir });
}

describe('Git Tools', () => {
  beforeEach(async () => {
    workspaceRoot = path.join(os.tmpdir(), `chimera-git-test-${Date.now()}`);
    await fs.mkdir(workspaceRoot, { recursive: true });
    await initGitRepo(workspaceRoot);
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  describe('git_status', () => {
    it('returns branch name', async () => {
      await createCommit(workspaceRoot, 'initial', 'file.txt', 'content');

      const result = await gitStatusTool.execute({}, makeContext());
      expect(result.branch).toBe('master');
    });

    it('detects untracked files', async () => {
      await createCommit(workspaceRoot, 'initial', 'file.txt', 'content');
      await fs.writeFile(path.join(workspaceRoot, 'new.txt'), 'new');

      const result = await gitStatusTool.execute({}, makeContext());
      expect(result.untracked).toContain('new.txt');
    });

    it('detects unstaged changes', async () => {
      await createCommit(workspaceRoot, 'initial', 'file.txt', 'original');
      await fs.writeFile(path.join(workspaceRoot, 'file.txt'), 'modified');

      const result = await gitStatusTool.execute({}, makeContext());
      expect(result.unstaged.length).toBeGreaterThanOrEqual(1);
      expect(result.unstaged[0].path).toBe('file.txt');
    });

    it('detects staged changes', async () => {
      await createCommit(workspaceRoot, 'initial', 'file.txt', 'original');
      await fs.writeFile(path.join(workspaceRoot, 'file.txt'), 'modified');
      await execa('git', ['add', 'file.txt'], { cwd: workspaceRoot });

      const result = await gitStatusTool.execute({}, makeContext());
      expect(result.staged.length).toBeGreaterThanOrEqual(1);
      expect(result.staged[0].path).toBe('file.txt');
    });
  });

  describe('git_diff', () => {
    it('shows uncommitted diff', async () => {
      await createCommit(workspaceRoot, 'initial', 'file.txt', 'original content');
      await fs.writeFile(path.join(workspaceRoot, 'file.txt'), 'modified content');

      const result = await gitDiffTool.execute({ uncommitted: true }, makeContext());
      expect(result.diff).toContain('original content');
      expect(result.diff).toContain('modified content');
      expect(result.filesChanged).toBeGreaterThanOrEqual(1);
    });

    it('shows staged diff', async () => {
      await createCommit(workspaceRoot, 'initial', 'file.txt', 'original');
      await fs.writeFile(path.join(workspaceRoot, 'file.txt'), 'staged change');
      await execa('git', ['add', 'file.txt'], { cwd: workspaceRoot });

      const result = await gitDiffTool.execute({ staged: true }, makeContext());
      expect(result.diff).toContain('staged change');
    });

    it('returns empty diff with no changes', async () => {
      await createCommit(workspaceRoot, 'initial', 'file.txt', 'content');

      const result = await gitDiffTool.execute({}, makeContext());
      expect(result.diff).toBe('');
      expect(result.filesChanged).toBe(0);
    });
  });

  describe('git_log', () => {
    it('returns commit history', async () => {
      await createCommit(workspaceRoot, 'first commit', 'file1.txt', 'a');
      await createCommit(workspaceRoot, 'second commit', 'file2.txt', 'b');

      const result = await gitLogTool.execute({}, makeContext());
      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.commits[0].message).toBe('second commit');
    });

    it('limits commits with maxCommits', async () => {
      for (let i = 0; i < 10; i++) {
        await createCommit(workspaceRoot, `commit ${i}`, `file${i}.txt`, String(i));
      }

      const result = await gitLogTool.execute({ maxCommits: 3 }, makeContext());
      expect(result.total).toBeLessThanOrEqual(3);
    }, 30000);

    it('includes commit metadata', async () => {
      await createCommit(workspaceRoot, 'metadata test', 'file.txt', 'content');

      const result = await gitLogTool.execute({}, makeContext());
      expect(result.commits[0].author).toBe('Test User');
      expect(result.commits[0].hash).toBeDefined();
      expect(result.commits[0].shortHash).toBeDefined();
      expect(result.commits[0].date).toBeDefined();
      expect(result.commits[0].files).toContain('file.txt');
    });
  });

  describe('git_branch', () => {
    it('lists branches', async () => {
      await createCommit(workspaceRoot, 'initial', 'file.txt', 'content');

      const result = await gitBranchTool.execute({ action: 'list' }, makeContext());
      expect(result.branch).toContain('master');
    });

    it('creates a branch', async () => {
      await createCommit(workspaceRoot, 'initial', 'file.txt', 'content');

      const result = await gitBranchTool.execute(
        { action: 'create', name: 'feature-branch' },
        makeContext(),
      );
      expect(result.created).toBe(true);
      expect(result.branch).toBe('feature-branch');
    });

    it('checks out a branch', async () => {
      await createCommit(workspaceRoot, 'initial', 'file.txt', 'content');

      await gitBranchTool.execute({ action: 'create', name: 'dev' }, makeContext());
      const result = await gitBranchTool.execute(
        { action: 'checkout', name: 'dev' },
        makeContext(),
      );
      expect(result.branch).toBe('dev');
    });

    it('deletes a branch', async () => {
      await createCommit(workspaceRoot, 'initial', 'file.txt', 'content');
      await gitBranchTool.execute({ action: 'create', name: 'to-delete' }, makeContext());

      const result = await gitBranchTool.execute(
        { action: 'delete', name: 'to-delete' },
        makeContext(),
      );
      expect(result.deleted).toBe(true);
    });

    it('throws when name is missing for create', async () => {
      await expect(
        gitBranchTool.execute({ action: 'create' }, makeContext()),
      ).rejects.toThrow('Branch name is required');
    });
  });

  describe('git write tools (init/add/commit)', () => {
    it('git_add rejects "." and "-A"', async () => {
      await expect(
        gitAddTool.execute({ files: ['.'] }, makeContext()),
      ).rejects.toThrow(/Refusing to stage/);
      await expect(
        gitAddTool.execute({ files: ['-A'] }, makeContext()),
      ).rejects.toThrow(/Refusing to stage/);
    });

    it('git_commit refuses when nothing is staged', async () => {
      await expect(
        gitCommitTool.execute({ message: 'x' }, makeContext()),
      ).rejects.toThrow(/Nothing staged/);
    });

    it('stages explicit files and commits', async () => {
      await fs.writeFile(path.join(workspaceRoot, 'a.txt'), 'a');
      await fs.writeFile(path.join(workspaceRoot, 'b.txt'), 'b');

      const addRes = await gitAddTool.execute({ files: ['a.txt', 'b.txt'] }, makeContext());
      expect(addRes.count).toBe(2);

      const commitRes = await gitCommitTool.execute(
        { message: 'add a and b', authorName: 'Chimera', authorEmail: 'chimera@localhost' },
        makeContext(),
      );
      expect(commitRes.committed).toBe(true);
      expect(commitRes.hash).toBeDefined();

      const log = await gitLogTool.execute({}, makeContext());
      expect(log.commits[0].message).toBe('add a and b');
    });

    it('git_init refuses when a repo already exists', async () => {
      await expect(gitInitTool.execute({}, makeContext())).rejects.toThrow(/already exists/);
    });
  });
});
