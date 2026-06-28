"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorktreeIsolation = void 0;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const node_path_1 = require("node:path");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
async function git(args, cwd) {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
}
async function gitExitCode(args, cwd) {
    try {
        await execFileAsync('git', args, { cwd });
        return 0;
    }
    catch (err) {
        if (err && typeof err === 'object' && 'code' in err) {
            return err.code;
        }
        return 1;
    }
}
class WorktreeIsolation {
    worktreesDir;
    constructor(gitRoot) {
        this.worktreesDir = (0, node_path_1.resolve)(gitRoot ?? process.cwd(), '.chimera-worktrees');
    }
    async createIsolatedWorktree(agentId) {
        const slug = agentId.slice(0, 8);
        const branch = `chimera-agent-${slug}`;
        const worktreePath = (0, node_path_1.resolve)(this.worktreesDir, `agent-${slug}`);
        const { stdout: gitRoot } = await git(['rev-parse', '--show-toplevel']);
        await git(['worktree', 'add', worktreePath, '-b', branch], gitRoot);
        const { stdout: headCommit } = await git(['rev-parse', 'HEAD'], worktreePath);
        return { worktreePath, branch, headCommit, gitRoot };
    }
    async cleanupWorktree(worktree, hasChanges) {
        if (hasChanges) {
            console.log(`Worktree ${worktree.worktreePath} has uncommitted changes; skipping removal.`);
            return;
        }
        await git(['worktree', 'remove', '--force', worktree.worktreePath], worktree.gitRoot);
        await git(['branch', '-D', worktree.branch], worktree.gitRoot);
    }
    async mergeBranch(worktree, commitMessage, targetBranch, stageAll) {
        const addArgs = stageAll ? ['add', '.'] : ['add', '-u'];
        await git(addArgs, worktree.worktreePath);
        await git(['commit', '-m', commitMessage], worktree.worktreePath);
        const branch = targetBranch ?? (await git(['branch', '--show-current'], worktree.gitRoot)).stdout;
        try {
            await git(['merge', worktree.branch], worktree.gitRoot);
            return { success: true };
        }
        catch {
            await git(['merge', '--abort'], worktree.gitRoot);
            const { stdout } = await git(['status'], worktree.gitRoot);
            return { success: false, conflict: stdout };
        }
    }
    async hasWorktreeChanges(worktreePath, sinceCommit) {
        const code = await gitExitCode(['diff', '--quiet', sinceCommit, 'HEAD'], worktreePath);
        return code !== 0;
    }
}
exports.WorktreeIsolation = WorktreeIsolation;
//# sourceMappingURL=worktree-isolation.js.map