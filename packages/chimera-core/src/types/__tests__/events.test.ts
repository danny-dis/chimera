import { describe, it, expect } from 'vitest';
import { ChimeraEventSchema } from '../events.js';

describe('ChimeraEventSchema — workflow & skill variants', () => {
  it('parses workflow_registered', () => {
    const evt = {
      type: 'workflow_registered',
      name: 'review',
      path: '/tmp/review.yaml',
      stepCount: 3,
    };
    const parsed = ChimeraEventSchema.parse(evt);
    expect(parsed).toEqual(evt);
  });

  it('parses workflow_run_started', () => {
    const evt = { type: 'workflow_run_started', name: 'review', runId: 'r-1' };
    expect(ChimeraEventSchema.parse(evt)).toEqual(evt);
  });

  it('parses workflow_run_completed (success)', () => {
    const evt = {
      type: 'workflow_run_completed',
      name: 'review',
      runId: 'r-1',
      status: 'success',
      durationMs: 1234,
      stepCount: 4,
    };
    expect(ChimeraEventSchema.parse(evt)).toEqual(evt);
  });

  it('parses workflow_run_completed (error)', () => {
    const evt = {
      type: 'workflow_run_completed',
      name: 'review',
      runId: 'r-1',
      status: 'error',
      durationMs: 999,
      stepCount: 1,
    };
    expect(ChimeraEventSchema.parse(evt)).toEqual(evt);
  });

  it('parses workflow_run_completed (cancelled)', () => {
    const evt = {
      type: 'workflow_run_completed',
      name: 'review',
      runId: 'r-1',
      status: 'cancelled',
      durationMs: 50,
      stepCount: 0,
    };
    expect(ChimeraEventSchema.parse(evt)).toEqual(evt);
  });

  it('rejects workflow_run_completed with unknown status', () => {
    const evt = {
      type: 'workflow_run_completed',
      name: 'review',
      runId: 'r-1',
      status: 'pending',
      durationMs: 50,
      stepCount: 0,
    };
    expect(() => ChimeraEventSchema.parse(evt)).toThrow();
  });

  it('parses workflow_step_completed for each kind', () => {
    for (const kind of ['llm', 'tool', 'parallel', 'sequence', 'gate'] as const) {
      const evt = { type: 'workflow_step_completed', name: 'w', runId: 'r', stepId: 's', kind, durationMs: 10 };
      expect(ChimeraEventSchema.parse(evt)).toEqual(evt);
    }
  });

  it('parses skill_loaded for each source', () => {
    for (const source of ['workspace', 'global', 'pack'] as const) {
      const evt = { type: 'skill_loaded', skillName: 'review', source, bytes: 4096 };
      expect(ChimeraEventSchema.parse(evt)).toEqual(evt);
    }
  });

  it('preserves existing variants', () => {
    const existing = {
      type: 'user_request',
      text: 'hi',
      mode: 'ask',
    };
    expect(ChimeraEventSchema.parse(existing)).toEqual(existing);
  });
});
