import { describe, it, expect } from 'vitest';
import { WorkflowRegistry } from '../registry.js';
import type { WorkflowDefinition } from '../types.js';

function makeWorkflow(name: string, stepCount = 1): WorkflowDefinition {
  return {
    name,
    description: `test ${name}`,
    steps: Array.from({ length: stepCount }, (_, i) => ({
      id: `${name}-step-${i}`,
      kind: 'llm' as const,
      config: { prompt: `step ${i}` },
    })),
  };
}

describe('WorkflowRegistry', () => {
  it('returns undefined for an unknown workflow', () => {
    const r = new WorkflowRegistry();
    expect(r.get('missing')).toBeUndefined();
    expect(r.has('missing')).toBe(false);
  });

  it('registers and retrieves a workflow by name', () => {
    const r = new WorkflowRegistry();
    const wf = makeWorkflow('review');
    r.register(wf);
    expect(r.has('review')).toBe(true);
    expect(r.get('review')).toBe(wf);
  });

  it('list returns all registered workflows in registration order', () => {
    const r = new WorkflowRegistry();
    const a = makeWorkflow('a');
    const b = makeWorkflow('b');
    const c = makeWorkflow('c');
    r.register(a);
    r.register(b);
    r.register(c);
    expect(r.list()).toEqual([a, b, c]);
  });

  it('re-registering a name replaces the previous entry (last-writer-wins)', () => {
    const r = new WorkflowRegistry();
    r.register(makeWorkflow('x', 1));
    r.register(makeWorkflow('x', 3));
    expect(r.get('x')?.steps).toHaveLength(3);
    expect(r.list()).toHaveLength(1);
  });

  it('throws when registering a workflow without a name', () => {
    const r = new WorkflowRegistry();
    // @ts-expect-error — intentionally bad input for the runtime guard
    expect(() => r.register({ steps: [] })).toThrow(/name is required/);
  });

  it('clear empties the registry', () => {
    const r = new WorkflowRegistry();
    r.register(makeWorkflow('a'));
    r.register(makeWorkflow('b'));
    r.clear();
    expect(r.list()).toEqual([]);
    expect(r.has('a')).toBe(false);
  });
});
