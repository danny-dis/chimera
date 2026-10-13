import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PathRestrictionEngine } from '../permission/path-restrictions.js';
import { runShellCommandTool } from '../tools/shell.js';
import type { ToolContext } from '../tool-schema.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-controller-tools-'));
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}

describe('controller production trust-boundary checks', () => {
  it('does not authorize the root after workspace canonicalization fails with EACCES', () => {
    const f = fixture();
    const spy = vi.spyOn(fs, 'realpathSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('controlled inaccessible root'), { code: 'EACCES' });
    });
    try {
      let allowed = false;
      try { allowed = new PathRestrictionEngine(f.root).isPathAllowed(f.root); }
      catch { /* Refusing construction is also fail-closed. */ }
      expect(allowed).toBe(false);
    } finally { spy.mockRestore(); f.cleanup(); }
  });

  it('cancellation reaps the exact started descendant PIDs', async () => {
    const f = fixture();
    const controller = new AbortController();
    const ready = path.join(f.root, 'tree.json');
    let pids: number[] = [];
    let pending: Promise<unknown> | undefined;
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    try {
      fs.writeFileSync(path.join(f.root, 'leaf.cjs'), "require('node:fs').writeFileSync('tree.json',JSON.stringify([process.ppid,process.pid]));setTimeout(()=>process.exit(0),15000);\n");
      fs.writeFileSync(path.join(f.root, 'parent.cjs'), "require('node:child_process').spawn(process.execPath,['leaf.cjs'],{stdio:'inherit'});setTimeout(()=>process.exit(0),15000);\n");
      pending = runShellCommandTool.execute(
        { command: 'node parent.cjs', timeout: 20_000 },
        { workspaceRoot: f.root, signal: controller.signal } as ToolContext,
      );
      const startDeadline = Date.now() + 10_000;
      while (!fs.existsSync(ready) && Date.now() < startDeadline) await new Promise(resolve => setTimeout(resolve, 25));
      expect(fs.existsSync(ready)).toBe(true);
      pids = JSON.parse(fs.readFileSync(ready, 'utf-8'));
      expect(pids).toHaveLength(2);
      expect(pids.every(alive)).toBe(true);
      controller.abort();
      const stopDeadline = Date.now() + 2_000;
      while (pids.some(alive) && Date.now() < stopDeadline) await new Promise(resolve => setTimeout(resolve, 25));
      expect(pids.filter(alive), 'owned descendants must stop, not just the shell').toEqual([]);
    } finally {
      controller.abort();
      if (!pids.length && fs.existsSync(ready)) pids = JSON.parse(fs.readFileSync(ready, 'utf-8'));
      for (const pid of pids) {
        if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
        else { try { process.kill(pid, 'SIGKILL'); } catch { /* already exited */ } }
      }
      await pending?.catch(() => undefined);
      f.cleanup();
    }
  }, 30_000);

  it('fails closed when an existing target cannot be canonicalized', () => {
    const f = fixture();
    try {
      fs.writeFileSync(path.join(f.root, 'target.txt'), 'data');
      const engine = new PathRestrictionEngine(f.root);
      const spy = vi.spyOn(fs, 'realpathSync').mockImplementationOnce(() => {
        throw Object.assign(new Error('controlled unreadable target'), { code: 'EACCES' });
      });
      try { expect(engine.isPathAllowed('target.txt')).toBe(false); }
      finally { spy.mockRestore(); }
    } finally { f.cleanup(); }
  });

  it('shell accepts a legitimate canonicalized junction workspace root', async () => {
    const f = fixture();
    try {
      const real = path.join(f.root, 'real');
      const alias = path.join(f.root, 'alias');
      fs.mkdirSync(real);
      fs.symlinkSync(real, alias, process.platform === 'win32' ? 'junction' : 'dir');
      const result = await runShellCommandTool.execute(
        { command: 'echo CANONICAL_ROOT_OK', timeout: 10_000 },
        { workspaceRoot: alias } as ToolContext,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CANONICAL_ROOT_OK');
    } finally { f.cleanup(); }
  });

  it('actually cancels a valid shell command after the child starts', async () => {
    const f = fixture();
    const controller = new AbortController();
    try {
      const ready = path.join(f.root, 'ready.txt');
      const script = path.join(f.root, 'child.cjs');
      fs.writeFileSync(script, "require('node:fs').writeFileSync(process.argv[2],String(process.pid));setTimeout(()=>process.exit(0),2000);\n");
      let observed: Awaited<ReturnType<typeof runShellCommandTool.execute>> | undefined;
      const pending = runShellCommandTool.execute(
        { command: 'node child.cjs ready.txt', timeout: 10_000 },
        { workspaceRoot: f.root, signal: controller.signal } as ToolContext,
      ).then(result => { observed = result; return result; });
      const deadline = Date.now() + 5_000;
      while (!observed && !fs.existsSync(ready) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(fs.existsSync(ready), `valid child must have actually started: ${JSON.stringify(observed)}`).toBe(true);
      controller.abort();
      const result = await pending;
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/cancel/i);
    } finally { controller.abort(); f.cleanup(); }
  });

  it('does not start hooks or tools after cancellation during hook loading', async () => {
    const f = fixture();
    try {
      const { ToolRegistry } = await import('../tool-registry.js');
      const { ToolExecutor } = await import('../tool-executor.js');
      const { z } = await import('zod');
      const controller = new AbortController();
      const run = vi.fn(async () => ({}));
      const hookRun = vi.fn(async () => []);
      const registry = new ToolRegistry();
      registry.register({
        name: 'sample', description: 'controlled cancellation probe',
        parameters: z.object({}), returns: z.object({}),
        category: 'search', permissionLevel: 'read', execute: run,
      });
      const hooks = {
        loadFromWorkspace: async () => { controller.abort(); },
        executeHooks: hookRun,
      };
      const executor = new ToolExecutor(registry, () => 'allow', undefined, hooks as any);
      const result = await executor.execute('sample', {}, {
        workspaceRoot: f.root, signal: controller.signal,
        eventStream: { append: () => {} },
      } as unknown as ToolContext);
      expect(result.success).toBe(false);
      expect(hookRun).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    } finally { f.cleanup(); }
  });
});
