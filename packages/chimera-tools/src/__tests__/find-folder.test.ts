import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { findFolderTool } from '../tools/find-folder.js';
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

describe('find_folder', () => {
  beforeEach(async () => {
    workspaceRoot = path.join(os.tmpdir(), `chimera-findfolder-test-${Date.now()}`);
    await fs.mkdir(workspaceRoot, { recursive: true });
    // target (substring match)
    await fs.mkdir(path.join(workspaceRoot, 'my-project'), { recursive: true });
    // glob match nested deeper
    await fs.mkdir(path.join(workspaceRoot, 'src', 'lib', 'widget-foo'), { recursive: true });
    // should be skipped by default
    await fs.mkdir(path.join(workspaceRoot, 'node_modules', 'should-be-skipped'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it('finds a folder by substring under workspaceRoot', async () => {
    const res = await findFolderTool.execute({ name: 'project' }, makeContext());
    expect(res.count).toBe(1);
    expect(res.folders[0]).toContain('my-project');
  });

  it('finds a folder by glob across depth', async () => {
    const res = await findFolderTool.execute({ name: 'widget-*' }, makeContext());
    expect(res.count).toBe(1);
    expect(res.folders[0]).toContain(path.join('src', 'lib', 'widget-foo'));
  });

  it('skips node_modules by default', async () => {
    const res = await findFolderTool.execute({ name: 'should-be-skipped' }, makeContext());
    expect(res.count).toBe(0);
  });

  it('searches an explicitly-named absolute path outside the workspace', async () => {
    // The user told us where it is — read-only discovery must not be jailed.
    const outside = path.join(os.tmpdir(), `chimera-outside-${Date.now()}`);
    await fs.mkdir(path.join(outside, 'external-cfg'), { recursive: true });
    const res = await findFolderTool.execute({ name: 'external-cfg', path: outside }, makeContext());
    expect(res.count).toBe(1);
    expect(res.folders[0]).toContain('external-cfg');
    await fs.rm(outside, { recursive: true, force: true });
  });
});
