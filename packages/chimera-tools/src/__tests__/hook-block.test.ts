import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import { ToolRegistry } from '../tool-registry.js';
import { ToolExecutor } from '../tool-executor.js';
import { HookExecutor } from '../hooks/executor.js';
import type { ToolDefinition, ToolContext } from '../tool-schema.js';
import { EventStream } from '@chimera/core';

// ToolExecutor.execute() calls HookExecutor.loadFromWorkspace(context.workspaceRoot),
// which consults the workspace trust store. Point CHIMERA_TRUST_STORE at an
// isolated (nonexistent) tmp file for every test so behavior never depends on
// the developer's real ~/.chimera/trusted-workspaces, and so an untrusted
// workspace never picks up a stray .chimera/hooks.yaml from disk — the hooks
// under test here are registered directly via HookExecutor.register().
let tmpHome: string;
let prevEnv: string | undefined;
let workspaceRoot: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-trusthome-'));
  prevEnv = process.env.CHIMERA_TRUST_STORE;
  process.env.CHIMERA_TRUST_STORE = path.join(tmpHome, 'trusted-workspaces');
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-hookblock-ws-'));
});

afterEach(async () => {
  if (prevEnv === undefined) {
    delete process.env.CHIMERA_TRUST_STORE;
  } else {
    process.env.CHIMERA_TRUST_STORE = prevEnv;
  }
  await fs.rm(tmpHome, { recursive: true, force: true });
  // On Windows, a just-spawned hook child process (cwd = workspaceRoot) can
  // briefly hold a directory handle after its 'close' event fires, racing
  // an immediate rmdir with EBUSY. Retry with backoff rather than flake.
  await fs.rm(workspaceRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function makeContext(): ToolContext {
  return {
    workspaceRoot,
    sessionId: 'hook-block-test',
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

const sampleTool: ToolDefinition = {
  name: 'sample',
  description: 'Sample tool',
  parameters: z.object({ value: z.string() }),
  returns: z.object({ result: z.string() }),
  category: 'search',
  permissionLevel: 'read',
  execute: async (params) => ({ result: params.value, ranWithParams: params }),
};

describe('pre-tool-use hook blocking', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(sampleTool);
  });

  it('a blocking hook fails execution without running the tool, and surfaces the reason', async () => {
    const hooks = new HookExecutor();
    hooks.register({
      id: 'deny-all',
      event: 'pre-tool-use',
      toolFilter: '*',
      // Use hook.script (spawned as `node -e <script>` with an argv array, no
      // shell) instead of hook.command so this test is quoting-free and
      // passes identically on Windows and POSIX shells.
      script: "console.log(JSON.stringify({ block: true, reason: 'blocked by policy' }))",
      canModify: false,
      priority: 0,
      enabled: true,
      timeout: 30000,
    });
    const executor = new ToolExecutor(registry, () => 'allow', undefined, hooks);

    let toolRan = false;
    registry.register({
      ...sampleTool,
      name: 'sample-tracked',
      execute: async (params) => {
        toolRan = true;
        return { result: String(params.value) };
      },
    });

    const result = await executor.execute('sample-tracked', { value: 'test' }, makeContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain('Blocked by pre-tool-use hook');
    expect(result.error).toContain('blocked by policy');
    expect(toolRan).toBe(false);
  });

  it('a non-blocking hook lets the call through', async () => {
    const hooks = new HookExecutor();
    hooks.register({
      id: 'allow-all',
      event: 'pre-tool-use',
      toolFilter: '*',
      script: "console.log(JSON.stringify({ block: false }))",
      canModify: false,
      priority: 0,
      enabled: true,
      timeout: 30000,
    });
    const executor = new ToolExecutor(registry, () => 'allow', undefined, hooks);

    const result = await executor.execute('sample', { value: 'test' }, makeContext());

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ result: 'test', ranWithParams: { value: 'test' } });
  });

  it('canModify:false still honors block, but cannot mutate params', async () => {
    // Regression: block used to be gated behind `if (hook.canModify)` alongside
    // param mutation, so a read-only gate hook (canModify: false, which is the
    // correct/safe posture for a pure veto hook) could never actually block.
    const hooks = new HookExecutor();
    hooks.register({
      id: 'no-modify-but-blocks',
      event: 'pre-tool-use',
      toolFilter: '*',
      script:
        "console.log(JSON.stringify({ block: true, reason: 'veto without modify rights', params: { value: 'tampered' } }))",
      canModify: false,
      priority: 0,
      enabled: true,
      timeout: 30000,
    });
    const executor = new ToolExecutor(registry, () => 'allow', undefined, hooks);

    const result = await executor.execute('sample', { value: 'original' }, makeContext());

    // Block must be honored even though canModify is false.
    expect(result.success).toBe(false);
    expect(result.error).toContain('veto without modify rights');
  });

  it('canModify:false hook cannot mutate params when it does NOT block (mutation dropped, execution proceeds with original params)', async () => {
    const hooks = new HookExecutor();
    hooks.register({
      id: 'no-modify-rights',
      event: 'pre-tool-use',
      toolFilter: '*',
      script: "console.log(JSON.stringify({ params: { value: 'tampered' } }))",
      canModify: false,
      priority: 0,
      enabled: true,
      timeout: 30000,
    });
    const executor = new ToolExecutor(registry, () => 'allow', undefined, hooks);

    const result = await executor.execute('sample', { value: 'original' }, makeContext());

    expect(result.success).toBe(true);
    // Params must remain untouched — the hook lacked canModify rights.
    expect(result.data).toEqual({ result: 'original', ranWithParams: { value: 'original' } });
  });
});
