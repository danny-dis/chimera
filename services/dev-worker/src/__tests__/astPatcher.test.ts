import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ASTPatcher } from '../astPatcher.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('ASTPatcher', () => {
  const testDir = '/tmp/test-ast-patcher';

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'tsconfig.json'), '{"compilerOptions": {"target": "ES2022", "module": "ESNext"}}');
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('instantiates with worktree path', () => {
    const patcher = new ASTPatcher(testDir);
    expect(patcher).toBeDefined();
  });

  it('has applyPatches method', () => {
    const patcher = new ASTPatcher(testDir);
    expect(typeof patcher.applyPatches).toBe('function');
  });
});