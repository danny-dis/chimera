import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { PathRestrictionEngine } from '../permission/path-restrictions.js';
import { ToolRegistry } from '../tool-registry.js';
import { ToolExecutor, setAutoApprove } from '../tool-executor.js';
import { runShellCommandTool } from '../tools/shell.js';
import type { ToolContext } from '../tool-schema.js';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-tools-spec-'));
  return { root, context: { workspaceRoot: root, eventStream: { append: vi.fn() } } as unknown as ToolContext,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}

describe('controller remaining tools specification gaps', () => {
  it('denies an inaccessible ancestor instead of interpreting existsSync false as ENOENT', () => {
    const f = fixture();
    const inaccessible = path.join(f.root, 'inaccessible');
    fs.mkdirSync(inaccessible);
    const realpath = fs.realpathSync;
    const exists = fs.existsSync;
    try {
      const engine = new PathRestrictionEngine(f.root);
      vi.spyOn(fs, 'existsSync').mockImplementation(p => String(p).startsWith(inaccessible) ? false : exists(p));
      vi.spyOn(fs, 'realpathSync').mockImplementation(((p: fs.PathLike) => {
        if (String(p).startsWith(inaccessible)) throw Object.assign(new Error('controlled inaccessible ancestor'), { code: 'EACCES' });
        return realpath(p);
      }) as typeof fs.realpathSync);
      expect(engine.isPathAllowed(path.join(inaccessible, 'new.txt'))).toBe(false);
      expect(engine.isPathAllowed('legitimate-new.txt')).toBe(true);
    } finally { vi.restoreAllMocks(); f.cleanup(); }
  });

  it('refuses unapproved ask before hooks can turn the decision into allow', async () => {
    const f = fixture();
    const noninteractive = process.env.NONINTERACTIVE;
    const approve = process.env.CHIMERA_AUTOAPPROVE;
    process.env.NONINTERACTIVE = '0'; process.env.CHIMERA_AUTOAPPROVE = '0'; setAutoApprove(false);
    try {
      const run = vi.fn(async () => ({}));
      const registry = new ToolRegistry();
      registry.register({ name: 'sample', description: 'controlled ask probe', parameters: z.object({ value: z.string() }),
        returns: z.object({}), category: 'search', permissionLevel: 'read', execute: run });
      const hooks = { loadFromWorkspace: vi.fn(async () => {}), executeHooks: vi.fn(async () => [{ modifiedParams: { value: 'allowed' } }]) };
      const executor = new ToolExecutor(registry, (_tool, p) => p.value === 'original' ? 'ask' : 'allow', undefined, hooks as any);
      const result = await executor.execute('sample', { value: 'original' }, f.context);
      expect(result.success).toBe(false);
      expect(hooks.loadFromWorkspace).not.toHaveBeenCalled();
      expect(hooks.executeHooks).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    } finally {
      if (noninteractive === undefined) delete process.env.NONINTERACTIVE; else process.env.NONINTERACTIVE = noninteractive;
      if (approve === undefined) delete process.env.CHIMERA_AUTOAPPROVE; else process.env.CHIMERA_AUTOAPPROVE = approve;
      setAutoApprove(false); f.cleanup();
    }
  });

  it('does not dispatch overwrite retry without authorizing changed arguments', async () => {
    const f = fixture();
    try {
      const run = vi.fn(async (p: { overwrite?: boolean }) => {
        if (!p.overwrite) throw new Error('File already exists and overwrite is false');
        return { ok: true };
      });
      const registry = new ToolRegistry();
      registry.register({ name: 'write_file', description: 'controlled overwrite probe', parameters: z.object({ overwrite: z.boolean().optional() }),
        returns: z.object({ ok: z.boolean() }), category: 'filesystem', permissionLevel: 'write', execute: run });
      const executor = new ToolExecutor(registry, (_tool, p) => p.overwrite === true ? 'deny' : 'allow');
      const result = await executor.execute('write_file', {}, f.context);
      expect(result.success).toBe(false);
      expect(run).toHaveBeenCalledTimes(1);
    } finally { f.cleanup(); }
  });

  it('timeout reaps the exact started descendants without relying on abort', async () => {
    const f = fixture();
    const ready = path.join(f.root, 'timeout-tree.json');
    let pids: number[] = [];
    let pending: ReturnType<typeof runShellCommandTool.execute> | undefined;
    try {
      fs.writeFileSync(path.join(f.root, 'leaf.cjs'), "require('node:fs').writeFileSync('timeout-tree.json',JSON.stringify([process.ppid,process.pid]));setTimeout(()=>process.exit(0),120000);\n");
      fs.writeFileSync(path.join(f.root, 'parent.cjs'), "require('node:child_process').spawn(process.execPath,['leaf.cjs'],{stdio:'inherit'});setTimeout(()=>process.exit(0),120000);\n");
      pending = runShellCommandTool.execute({ command: 'node parent.cjs', timeout: 20_000 }, f.context);
      const started = Date.now() + 15_000;
      while (!fs.existsSync(ready) && Date.now() < started) await pause(25);
      expect(fs.existsSync(ready), 'timeout must follow actual child startup').toBe(true);
      pids = JSON.parse(fs.readFileSync(ready, 'utf8'));
      expect(pids).toHaveLength(2);
      expect(pids.every(alive)).toBe(true);
      console.info('TIMEOUT_STARTED_OWNED_PIDS', JSON.stringify(pids));
      await pause(20_000);
      const stopped = Date.now() + 2_000;
      while (pids.some(alive) && Date.now() < stopped) await pause(25);
      console.info('TIMEOUT_SURVIVING_OWNED_PIDS', JSON.stringify(pids.filter(alive)));
      expect(pids.filter(alive), 'timeout must reap owned descendants before losing shell PID').toEqual([]);
      const result = await pending;
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/time.*out/i);
    } finally {
      if (!pids.length && fs.existsSync(ready)) pids = JSON.parse(fs.readFileSync(ready, 'utf8'));
      for (const pid of pids) {
        if (!alive(pid)) continue;
        if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 10_000 });
        else { try { process.kill(pid, 'SIGKILL'); } catch { /* exact owned PID already exited */ } }
      }
      await Promise.race([pending?.catch(() => undefined), pause(15_000)]); f.cleanup();
    }
  }, 75_000);

  it('proves child startup while checking environment isolation and PATH', async () => {
    const f = fixture();
    const key = 'CHIMERA_SPEC_ENV_SENTINEL';
    const previous = process.env[key];
    process.env[key] = 'private-test-sentinel';
    try {
      fs.writeFileSync(path.join(f.root, 'env.cjs'), "console.log('ENV_STARTED');console.log(process.env.CHIMERA_SPEC_ENV_SENTINEL||'NOT_FOUND');console.log((process.env.PATH||process.env.Path)?'PATH_PRESENT':'PATH_MISSING');\n");
      const result = await runShellCommandTool.execute({ command: 'node env.cjs', timeout: 10_000 }, f.context);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('ENV_STARTED');
      expect(result.stdout).toContain('NOT_FOUND');
      expect(result.stdout).toContain('PATH_PRESENT');
      expect(result.stdout).not.toContain('private-test-sentinel');
    } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; f.cleanup(); }
  }, 20_000);
});
