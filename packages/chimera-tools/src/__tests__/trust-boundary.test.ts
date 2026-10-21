import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs, existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import { ToolRegistry } from '../tool-registry.js';
import { ToolExecutor } from '../tool-executor.js';
import { HookExecutor } from '../hooks/executor.js';
import { PathRestrictionEngine } from '../permission/path-restrictions.js';
import { runShellCommandTool } from '../tools/shell.js';
import type { ToolContext } from '../tool-schema.js';
import { EventStream } from '@chimera/core';

// ── Setup ────────────────────────────────────────────────────────────────────

let tmpHome: string;
let prevTrustStore: string | undefined;
let workspaceRoot: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-trusthome-'));
  prevTrustStore = process.env.CHIMERA_TRUST_STORE;
  process.env.CHIMERA_TRUST_STORE = path.join(tmpHome, 'trusted-workspaces');
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-trust-ws-'));
});

afterEach(async () => {
  if (prevTrustStore === undefined) {
    delete process.env.CHIMERA_TRUST_STORE;
  } else {
    process.env.CHIMERA_TRUST_STORE = prevTrustStore;
  }
  await fs.rm(tmpHome, { recursive: true, force: true });
  await fs.rm(workspaceRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    workspaceRoot,
    sessionId: 'trust-test',
    eventStream: new EventStream(),
    costTracker: {
      setBudget: () => {},
      recordSpend: () => {},
      getSpend: () => 0,
      getRemaining: () => Infinity,
    } as any,
    permissionCheck: () => 'allow',
    ...overrides,
  };
}

function symlinkType(): 'dir' | 'junction' {
  return process.platform === 'win32' ? 'junction' : 'dir';
}

// ── Defect 1: shell cwd containment via startsWith ───────────────────────────

describe('shell cwd containment (startsWith bypass)', () => {
  it('rejects sibling directory sharing workspace prefix', async () => {
    const sibling = workspaceRoot + '-extra';
    await fs.mkdir(sibling, { recursive: true });
    try {
      const context = makeContext();
      await expect(
        runShellCommandTool.execute(
          { command: 'node -e "console.log(1)"', cwd: '../' + path.basename(sibling), timeout: 30_000 },
          context,
        ),
      ).rejects.toThrow();
    } finally {
      await fs.rm(sibling, { recursive: true, force: true });
    }
  });

  it('rejects traversal outside workspace', async () => {
    const context = makeContext();
    await expect(
      runShellCommandTool.execute(
        { command: 'node -e "console.log(1)"', cwd: '../../etc', timeout: 30_000 },
        context,
      ),
    ).rejects.toThrow();
  });

  it('allows legitimate in-workspace cwd', async () => {
    const subdir = path.join(workspaceRoot, 'src');
    await fs.mkdir(subdir, { recursive: true });
    const context = makeContext();
    const result = await runShellCommandTool.execute(
      { command: 'echo hello', cwd: 'src', timeout: 30_000 },
      context,
    );
    expect(result.stdout).toContain('hello');
  });
});

// ── Defect 2: env inheritance ────────────────────────────────────────────────

describe('shell env isolation', () => {
  it('does not leak arbitrary process.env to child', async () => {
    const sentinel = 'CHIMERA_TEST_SENTINEL_' + Date.now();
    process.env[sentinel] = 'should_not_leak';
    try {
      const context = makeContext();
      await fs.writeFile(path.join(workspaceRoot, 'env.cjs'), `console.log(process.env.${sentinel} || 'NOT_FOUND');`);
      const result = await runShellCommandTool.execute(
        { command: 'node env.cjs', timeout: 30_000 },
        context,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe('NOT_FOUND');
    } finally {
      delete process.env[sentinel];
    }
  });

  it('preserves PATH for command execution', async () => {
    const context = makeContext();
    await fs.writeFile(path.join(workspaceRoot, 'env.cjs'), "console.log(process.env.PATH || process.env.Path || 'NO_PATH');");
    const result = await runShellCommandTool.execute(
      { command: 'node env.cjs', timeout: 30_000 },
      context,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout.trim()).not.toBe('');
    expect(result.stdout).not.toContain('NO_PATH');
  });

  it('passes explicit non-secret env vars', async () => {
    const context = makeContext();
    await fs.writeFile(path.join(workspaceRoot, 'env.cjs'), 'console.log(process.env.MY_VAR);');
    const result = await runShellCommandTool.execute(
      {
        command: 'node env.cjs',
        env: { MY_VAR: 'explicit_value' },
        timeout: 30_000,
      },
      context,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('explicit_value');
  });
});

// ── Defect 3: pre-aborted signal ─────────────────────────────────────────────

describe('shell signal handling', () => {
  it('refuses to execute when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const context = makeContext({ signal: controller.signal });
    await expect(
      runShellCommandTool.execute({ command: 'node -e "console.log(1)"', timeout: 30_000 }, context),
    ).rejects.toThrow();
  });

  it('does not write pre-cancel marker when signal already aborted', async () => {
    const markerPath = path.join(workspaceRoot, 'should-not-exist.txt');
    const controller = new AbortController();
    controller.abort();
    const context = makeContext({ signal: controller.signal });
    await expect(
      runShellCommandTool.execute(
        { command: `node -e "require('fs').writeFileSync(process.argv[1], 'ran')" ${markerPath}`, timeout: 30_000 },
        context,
      ),
    ).rejects.toThrow();
    expect(existsSync(markerPath)).toBe(false);
  });

  it('cancels live shell and kills descendant process', async () => {
    const controller = new AbortController();
    const context = makeContext({ signal: controller.signal });
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    // A script that spawns a long-lived grandchild and records its exact PID.
    await fs.writeFile(
      path.join(workspaceRoot, 'tree.cjs'),
      "const cp=require('child_process');const c=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});"
        + "c.on('spawn',()=>require('fs').writeFileSync(process.argv[2],String(c.pid)));setInterval(()=>{},1000);\n",
    );
    const promise = runShellCommandTool.execute(
      { command: 'node tree.cjs descendant.pid', timeout: 60_000 },
      context,
    );
    const pidFile = path.join(workspaceRoot, 'descendant.pid');
    try {
      const startDeadline = Date.now() + 5_000;
      while (!existsSync(pidFile) && Date.now() < startDeadline) await new Promise(resolve => setTimeout(resolve, 25));
      expect(existsSync(pidFile)).toBe(true);
      const descendantPid = Number(await fs.readFile(pidFile, 'utf-8'));
      expect(alive(descendantPid)).toBe(true);
      controller.abort();
      const result = await promise;
      expect(result.exitCode).not.toBe(0);
      const stopDeadline = Date.now() + 2_000;
      while (alive(descendantPid) && Date.now() < stopDeadline) await new Promise(resolve => setTimeout(resolve, 25));
      expect(alive(descendantPid), 'owned descendant must be reaped by exact PID').toBe(false);
      if (process.platform === 'win32') {
        // Fresh verification context: the cancelled one must not be reused.
        const check = await runShellCommandTool.execute(
          { command: 'tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH', timeout: 10_000 },
          makeContext(),
        );
        expect(check.stdout).not.toContain('setInterval');
      }
    } finally {
      controller.abort();
      await promise;
    }
  });
});

// ── Defect 4: PathRestrictionEngine symlink ancestor ─────────────────────────

describe('PathRestrictionEngine symlink ancestor', () => {
  it('rejects symlink pointing outside workspace', async () => {
    const outsideDir = path.join(workspaceRoot, '..', 'outside-target');
    await fs.mkdir(outsideDir, { recursive: true });
    const symlinkPath = path.join(workspaceRoot, 'evil-link');
    await fs.symlink(outsideDir, symlinkPath, symlinkType());
    try {
      const engine = new PathRestrictionEngine(workspaceRoot);
      expect(engine.isPathAllowed('evil-link')).toBe(false);
    } finally {
      await fs.rm(symlinkPath, { recursive: true, force: true });
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('rejects non-existent descendant of symlinked ancestor', async () => {
    const outsideDir = path.join(workspaceRoot, '..', 'outside-target');
    await fs.mkdir(outsideDir, { recursive: true });
    const symlinkPath = path.join(workspaceRoot, 'evil-link');
    await fs.symlink(outsideDir, symlinkPath, symlinkType());
    try {
      const engine = new PathRestrictionEngine(workspaceRoot);
      expect(engine.isPathAllowed('evil-link/nonexistent.txt')).toBe(false);
    } finally {
      await fs.rm(symlinkPath, { recursive: true, force: true });
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('allows symlinked workspace root', async () => {
    const realDir = path.join(workspaceRoot, 'real');
    await fs.mkdir(realDir, { recursive: true });
    const symlinkRoot = workspaceRoot + '-link';
    await fs.symlink(realDir, symlinkRoot, symlinkType());
    try {
      const engine = new PathRestrictionEngine(symlinkRoot);
      expect(engine.isPathAllowed('file.txt')).toBe(true);
    } finally {
      await fs.rm(symlinkRoot, { recursive: true, force: true });
    }
  });
});

// ── Defect 5: ToolExecutor hooks before permission ───────────────────────────

describe('ToolExecutor permission boundary', () => {
  it('deny is not overridden by hook param mutation', async () => {
    const registry = new ToolRegistry();
    let toolRan = false;
    registry.register({
      name: 'sample',
      description: 'Sample',
      parameters: z.object({ value: z.string() }),
      returns: z.object({ result: z.string() }),
      category: 'search',
      permissionLevel: 'read',
      execute: async (params) => {
        toolRan = true;
        return { result: params.value };
      },
    });
    const hooks = new HookExecutor();
    hooks.register({
      id: 'mutator',
      event: 'pre-tool-use',
      toolFilter: '*',
      script: "console.log(JSON.stringify({ params: { value: 'mutated' } }))",
      canModify: true,
      priority: 0,
      enabled: true,
      timeout: 30000,
    });
    const executor = new ToolExecutor(
      registry,
      (_tool, params) => (params.value === 'original' ? 'deny' : 'allow'),
      undefined,
      hooks,
    );
    const result = await executor.execute('sample', { value: 'original' }, makeContext());
    expect(result.success).toBe(false);
    expect(result.error).toContain('Permission denied');
    expect(toolRan).toBe(false);
  });
});

// ── Defect 6: ToolExecutor cancellation ──────────────────────────────────────

describe('ToolExecutor cancellation', () => {
  it('does not execute tool when signal is already aborted', async () => {
    const registry = new ToolRegistry();
    let toolRan = false;
    registry.register({
      name: 'sample',
      description: 'Sample',
      parameters: z.object({}),
      returns: z.object({}),
      category: 'search',
      permissionLevel: 'read',
      execute: async () => {
        toolRan = true;
        return {};
      },
    });
    const controller = new AbortController();
    controller.abort();
    const context = makeContext({ signal: controller.signal });
    const executor = new ToolExecutor(registry, () => 'allow');
    const result = await executor.execute('sample', {}, context);
    expect(result.success).toBe(false);
    expect(toolRan).toBe(false);
  });
});
