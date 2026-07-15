import { describe, it, expect } from 'vitest';
import { WorkflowRegistry } from '../registry.js';
import { BUILT_IN_WORKFLOWS, registerBuiltInWorkflows, defaultWorkflowFor } from '../builtins/index.js';

describe('builtin workflow: release-cut (Step 5 PoC)', () => {
  it('registers the release-cut multi-skill workflow', () => {
    const reg = new WorkflowRegistry();
    registerBuiltInWorkflows(reg);
    const wf = reg.get('release-cut');
    expect(wf).toBeDefined();
    // 6 steps: validate → collect → changelog → bump → pr-gate → pr
    expect(wf!.steps).toHaveLength(6);
    expect(wf!.tags).toContain('release');
    expect(wf!.tags).toContain('multi-skill');
  });

  it('release-cut sequences the release skill across phases', () => {
    const wf = BUILT_IN_WORKFLOWS.find((w) => w.name === 'release-cut')!;
    const skills = wf.steps.filter((s) => s.kind === 'tool').map((s) => (s.config as any).skill);
    expect(skills.every((s) => s === 'release')).toBe(true);
    const gate = wf.steps.find((s) => s.kind === 'gate');
    expect(gate).toBeDefined();
    expect((gate!.config as any).passOn).toBe('PASS');
  });

  it('does not override existing default-for-mode mappings', () => {
    expect(defaultWorkflowFor('code')).toBe('standard-draft');
    expect(defaultWorkflowFor('review')).toBe('quality-gate');
  });
});
