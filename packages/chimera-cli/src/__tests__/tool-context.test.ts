import { describe, it, expect } from 'vitest';
import { buildPermissionEngine, createToolContext } from '../tool-context.js';
import { PermissionEngine } from '@chimera/tools';

describe('buildPermissionEngine', () => {
  it('read-only modes deny write tools even with yolo', () => {
    for (const mode of ['ask', 'plan', 'review'] as const) {
      const engine = buildPermissionEngine(mode, true, false);
      expect(engine.check('write_file', {})).toBe('deny');
      expect(engine.check('edit_file', {})).toBe('deny');
      expect(engine.check('run_shell_command', { command: 'rm -rf /' })).toBe('deny');
    }
  });

  it('yolo elevates code/debug to fullAccess', () => {
    const engine = buildPermissionEngine('code', true, false);
    expect(engine.check('write_file', {})).toBe('allow');
    expect(engine.check('run_shell_command', { command: 'rm -rf /' })).toBe('allow');
  });

  it('code/debug without yolo uses editFiles profile', () => {
    const engine = buildPermissionEngine('code', false, false);
    expect(engine.check('write_file', {})).toBe('allow');
    expect(engine.check('run_shell_command', { command: 'rm -rf /' })).toBe('deny');
  });

  it('interactive mode flips write tools to ask', () => {
    const engine = buildPermissionEngine('code', false, true);
    expect(engine.check('write_file', {})).toBe('ask');
    expect(engine.check('edit_file', {})).toBe('ask');
  });

  it('read-only modes stay read-only even interactive', () => {
    const engine = buildPermissionEngine('plan', false, true);
    expect(engine.check('write_file', {})).toBe('deny');
  });

  it('yolo + interactive still allows write (yolo bypasses ask)', () => {
    const engine = buildPermissionEngine('code', true, true);
    expect(engine.check('write_file', {})).toBe('allow');
  });
});

describe('createToolContext', () => {
  it('read-only mode denies write tools', () => {
    const { toolExecutor } = createToolContext('plan');
    const engine = (toolExecutor as any).permissionEngine as PermissionEngine;
    expect(engine).toBeDefined();
    expect(engine.check('write_file', {})).toBe('deny');
  });

  it('code mode allows write tools', () => {
    const { toolExecutor } = createToolContext('code');
    const engine = (toolExecutor as any).permissionEngine as PermissionEngine;
    expect(engine).toBeDefined();
    expect(engine.check('write_file', {})).toBe('allow');
  });

  it('interactive code mode asks for write tools', () => {
    const { toolExecutor } = createToolContext('code', { interactive: true });
    const engine = (toolExecutor as any).permissionEngine as PermissionEngine;
    expect(engine).toBeDefined();
    expect(engine.check('write_file', {})).toBe('ask');
  });

  it('yolo code mode allows write tools', () => {
    const { toolExecutor } = createToolContext('code', { yolo: true });
    const engine = (toolExecutor as any).permissionEngine as PermissionEngine;
    expect(engine).toBeDefined();
    expect(engine.check('write_file', {})).toBe('allow');
  });

  it('registers all builtin tools', () => {
    const { toolRegistry } = createToolContext('code');
    expect(toolRegistry.getAll().length).toBeGreaterThan(0);
  });
});
