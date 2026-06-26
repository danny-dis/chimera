import { describe, it, expect } from 'vitest';
import { bootstrap, WorkflowRegistry } from '../bootstrap.js';

describe('WorkflowRegistry', () => {
  it('starts empty', () => {
    const registry = new WorkflowRegistry();
    expect(registry.list()).toEqual([]);
  });

  it('registers and retrieves workflows', () => {
    const registry = new WorkflowRegistry();
    const wf = { name: 'test', steps: [] };
    registry.register('test', wf);
    expect(registry.get('test')).toBe(wf);
  });

  it('returns undefined for unknown workflow', () => {
    const registry = new WorkflowRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('lists all registered workflow names', () => {
    const registry = new WorkflowRegistry();
    registry.register('alpha', {});
    registry.register('beta', {});
    expect(registry.list()).toEqual(['alpha', 'beta']);
  });

  it('overwrites existing workflow with same name', () => {
    const registry = new WorkflowRegistry();
    registry.register('wf', { v: 1 });
    registry.register('wf', { v: 2 });
    expect((registry.get('wf') as any).v).toBe(2);
  });
});

describe('bootstrap', () => {
  it('returns a workflowRegistry with built-in workflows', () => {
    const { workflowRegistry } = bootstrap();
    const names = workflowRegistry.list();

    expect(names).toContain('quality-gate');
    expect(names).toContain('standard-draft');
  });

  it('quality-gate workflow has expected structure', () => {
    const { workflowRegistry } = bootstrap();
    const qualityGate = workflowRegistry.get('quality-gate') as any;

    expect(qualityGate.name).toBe('quality-gate');
    expect(qualityGate.steps).toBeDefined();
    expect(qualityGate.steps.length).toBeGreaterThan(0);
  });

  it('standard-draft workflow has expected structure', () => {
    const { workflowRegistry } = bootstrap();
    const standardDraft = workflowRegistry.get('standard-draft') as any;

    expect(standardDraft.name).toBe('standard-draft');
    expect(standardDraft.steps).toHaveLength(1);
    expect(standardDraft.steps[0].kind).toBe('llm');
    expect(standardDraft.steps[0].role).toBe('writer');
  });
});
