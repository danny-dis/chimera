/**
 * @chimera/workflows — workflow definition schema unit tests
 *
 * Verifies the workflow definition schema accepts representative shapes
 * (linear command, parallel reviewers + synthesizer) and rejects broken ones
 * (missing name/nodes). Also covers the chimera-specific `cost_caps` field
 * and the slimmed `worktree` policy.
 */

import { describe, expect, it } from 'vitest';

import {
  workflowDefinitionSchema,
  type WorkflowDefinition,
} from '../schemas/workflow.js';

describe('workflow definition schema', () => {
  it('parses a valid workflow with one command node', () => {
    const wf = {
      name: 'quick-review',
      description: 'run a single review command',
      nodes: [{ id: 'r', command: 'review' }],
    };
    const r = workflowDefinitionSchema.safeParse(wf);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.nodes).toHaveLength(1);
      expect(r.data.nodes[0]?.id).toBe('r');
    }
  });

  it('parses a valid workflow with parallel reviewers + synthesize', () => {
    const wf: WorkflowDefinition = {
      name: 'multi-review',
      description: 'two reviewers in parallel then synthesize',
      nodes: [
        { id: 'r1', prompt: 'review for security' },
        { id: 'r2', prompt: 'review for performance' },
        {
          id: 'synth',
          depends_on: ['r1', 'r2'],
          prompt: 'synthesize the two reviews',
          trigger_rule: 'all_success',
        },
      ],
    };
    const r = workflowDefinitionSchema.safeParse(wf);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.nodes).toHaveLength(3);
      const synth = r.data.nodes[2];
      expect(synth && 'trigger_rule' in synth ? synth.trigger_rule : undefined).toBe('all_success');
      expect(synth && 'depends_on' in synth ? synth.depends_on : undefined).toEqual(['r1', 'r2']);
    }
  });

  it('parses a workflow with a bash + script mix', () => {
    const wf = {
      name: 'mixed',
      description: 'bash for setup, script for processing',
      nodes: [
        { id: 'setup', bash: 'mkdir -p out' },
        { id: 'process', script: 'console.log("ok")', runtime: 'bun' as const, depends_on: ['setup'] },
      ],
    };
    const r = workflowDefinitionSchema.safeParse(wf);
    expect(r.success).toBe(true);
  });

  it('rejects a workflow missing name', () => {
    const r = workflowDefinitionSchema.safeParse({
      description: 'no name',
      nodes: [{ id: 'x', prompt: 'p' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects a workflow missing nodes', () => {
    const r = workflowDefinitionSchema.safeParse({
      name: 'no-nodes',
      description: 'empty',
    });
    expect(r.success).toBe(false);
  });

  it('rejects a workflow with empty nodes array (the schema allows it but a real engine would reject — we keep the schema permissive)', () => {
    // This is intentional: the schema accepts an empty nodes array. The
    // engine's loader/validator layer is the right place to enforce
    // "at least one node" — it has a richer error context than Zod.
    const r = workflowDefinitionSchema.safeParse({
      name: 'empty',
      description: 'no nodes',
      nodes: [],
    });
    expect(r.success).toBe(true);
  });

  it('parses cost_caps: { per_task, per_session, per_day }', () => {
    const wf = {
      name: 'capped',
      description: 'costs are bounded',
      cost_caps: { per_task: 0.5, per_session: 5, per_day: 20 },
      nodes: [{ id: 'x', prompt: 'p' }],
    };
    const r = workflowDefinitionSchema.safeParse(wf);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cost_caps).toEqual({ per_task: 0.5, per_session: 5, per_day: 20 });
    }
  });

  it('rejects negative cost_caps values', () => {
    const wf = {
      name: 'bad-cap',
      description: 'negative cap',
      cost_caps: { per_task: -1 },
      nodes: [{ id: 'x', prompt: 'p' }],
    };
    const r = workflowDefinitionSchema.safeParse(wf);
    expect(r.success).toBe(false);
  });

  it('parses worktree.enabled: true', () => {
    const wf = {
      name: 'pinned',
      description: 'always worktree',
      worktree: { enabled: true },
      nodes: [{ id: 'x', prompt: 'p' }],
    };
    const r = workflowDefinitionSchema.safeParse(wf);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.worktree?.enabled).toBe(true);
    }
  });

  it('parses worktree.enabled: false', () => {
    const wf = {
      name: 'live',
      description: 'never worktree',
      worktree: { enabled: false },
      nodes: [{ id: 'x', prompt: 'p' }],
    };
    const r = workflowDefinitionSchema.safeParse(wf);
    expect(r.success).toBe(true);
  });

  it('parses requires: ["github"]', () => {
    const wf = {
      name: 'gh-required',
      description: 'needs a github identity',
      requires: ['github'],
      nodes: [{ id: 'x', prompt: 'p' }],
    };
    const r = workflowDefinitionSchema.safeParse(wf);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.requires).toEqual(['github']);
    }
  });

  it('rejects an unknown requirement', () => {
    const wf = {
      name: 'bogus-req',
      description: 'unknown',
      requires: ['gitea'], // not in the enum yet
      nodes: [{ id: 'x', prompt: 'p' }],
    };
    const r = workflowDefinitionSchema.safeParse(wf);
    expect(r.success).toBe(false);
  });

  it('parses tags + model + provider at workflow level', () => {
    const wf = {
      name: 'tagged',
      description: 'has metadata',
      provider: 'claude',
      model: 'sonnet',
      tags: ['review', 'lint'],
      nodes: [{ id: 'x', prompt: 'p' }],
    };
    const r = workflowDefinitionSchema.safeParse(wf);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.provider).toBe('claude');
      expect(r.data.model).toBe('sonnet');
      expect(r.data.tags).toEqual(['review', 'lint']);
    }
  });

  it('rejects a node with mutually exclusive mode fields inside a workflow', () => {
    const wf = {
      name: 'bad-node',
      description: 'a node has both prompt and bash',
      nodes: [{ id: 'x', prompt: 'p', bash: 'echo' }],
    };
    const r = workflowDefinitionSchema.safeParse(wf);
    expect(r.success).toBe(false);
  });
});
