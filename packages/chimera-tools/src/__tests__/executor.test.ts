import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { HookExecutor } from '../hooks/executor.js';
import type { HookContext } from '../hooks/schema.js';

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-executor-test-'));
});

afterEach(async () => {
  // On Windows, a just-spawned hook child process (cwd = workspaceRoot) can
  // briefly hold a directory handle after its 'close' event fires, racing
  // an immediate rmdir with EBUSY. Retry with backoff rather than flake.
  await fs.rm(workspaceRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function makeContext(): HookContext {
  return {
    workspaceRoot,
    sessionId: 'executor-test',
    event: 'pre-tool-use',
    toolName: 'test_tool',
    data: {},
  };
}

describe('HookExecutor', () => {
  it('runs a hook script that resolves normally and captures stdout', async () => {
    const hooks = new HookExecutor();
    hooks.register({
      id: 'echo-hello',
      event: 'pre-tool-use',
      // hook.script is spawned as `node -e <script>` via argv (no shell),
      // so this is quoting-free and identical on Windows and POSIX.
      script: "console.log('hello-hook')",
      canModify: false,
      priority: 0,
      enabled: true,
      timeout: 30000,
    });

    const results = await hooks.executeHooks('pre-tool-use', makeContext());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].output).toBe('hello-hook');
  });

  it('times out a hook script that hangs, reporting the timeout and its duration', async () => {
    const hooks = new HookExecutor();
    hooks.register({
      id: 'sleep-forever',
      event: 'pre-tool-use',
      script: 'setTimeout(() => {}, 60000)',
      canModify: false,
      priority: 0,
      enabled: true,
      timeout: 500,
    });

    const results = await hooks.executeHooks('pre-tool-use', makeContext());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('timed out after 500ms');
  });
});
