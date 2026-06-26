import { describe, it, expect, beforeEach } from 'vitest';
import { HandoffProtocol } from '../handoff-protocol.js';
import type { HandoffProposal } from '../handoff-protocol.js';
import type { ChimeraEvent } from '@chimera/core';

function makeEvent(type: string, overrides: Record<string, unknown> = {}): ChimeraEvent {
  const base: Record<string, unknown> = { type, ...overrides };
  return base as unknown as ChimeraEvent;
}

function makeProposal(overrides: Partial<HandoffProposal> = {}): HandoffProposal {
  return {
    claimId: `claim-${Date.now()}`,
    type: 'fact',
    content: 'test claim',
    confidence: 0.9,
    source: 'test-agent',
    ...overrides,
  };
}

describe('HandoffProtocol', () => {
  let protocol: HandoffProtocol;

  beforeEach(() => {
    protocol = new HandoffProtocol();
  });

  describe('createCompactingHandoff', () => {
    it('creates a valid HandoffDocument from events', () => {
      const events = [
        makeEvent('user_request', { text: 'Fix the bug', mode: 'code' }),
        makeEvent('patch_proposed', { patchId: 'p1', files: ['src/a.ts'] }),
        makeEvent('tool_call_result', { result: { tool: 'bash', output: 'ok', exitCode: 0 } }),
        makeEvent('final_response', { status: 'done', cost: 0.5, agentCount: 1 }),
      ];

      const doc = protocol.createCompactingHandoff(events, { session: 's1', agent: 'a1', provider: 'openai' });

      expect(doc.goal).toBe('Fix the bug');
      expect(doc.status).toBe('done');
      expect(doc.filesModified).toHaveLength(1);
      expect(doc.filesModified[0].path).toBe('src/a.ts');
      expect(doc.meta.session).toBe('s1');
      expect(doc.meta.agent).toBe('a1');
      expect(doc.meta.provider).toBe('openai');
    });

    it('defaults to in_progress when no final_response', () => {
      const events = [makeEvent('user_request', { text: 'Do something', mode: 'code' })];
      const doc = protocol.createCompactingHandoff(events);
      expect(doc.status).toBe('in_progress');
    });

    it('extracts errors from failed tool calls', () => {
      const events = [
        makeEvent('tool_call_result', { result: { tool: 'test', output: 'fail', exitCode: 1 } }),
      ];
      const doc = protocol.createCompactingHandoff(events);
      expect(doc.errors.length).toBeGreaterThan(0);
      expect(doc.errors[0]).toContain('exit code 1');
    });
  });

  describe('createDeltaHandoff', () => {
    it('creates a delta between two event sets', () => {
      const oldEvents = [makeEvent('user_request', { text: 'task', mode: 'code' })];
      const newEvents = [
        ...oldEvents,
        makeEvent('patch_proposed', { patchId: 'p1', files: ['src/new.ts'] }),
      ];

      const delta = protocol.createDeltaHandoff('base-1', oldEvents, newEvents);
      expect(delta.base).toBe('base-1');
      expect(delta.filesModifiedAdded).toHaveLength(1);
      expect(delta.filesModifiedAdded[0].path).toBe('src/new.ts');
    });

    it('returns empty delta when no new events', () => {
      const events = [makeEvent('user_request', { text: 'task', mode: 'code' })];
      const delta = protocol.createDeltaHandoff('base-1', events, events);
      expect(delta.filesModifiedAdded).toHaveLength(0);
      expect(delta.decisionsAdded).toHaveLength(0);
    });
  });

  describe('serializeHandoff / parseHandoff', () => {
    it('round-trips a handoff document', () => {
      const events = [
        makeEvent('user_request', { text: 'Fix bug', mode: 'code' }),
        makeEvent('patch_proposed', { patchId: 'p1', files: ['src/a.ts'] }),
        makeEvent('final_response', { status: 'done', cost: 0.1, agentCount: 1 }),
      ];
      const doc = protocol.createCompactingHandoff(events, { session: 's1' });
      const serialized = protocol.serializeHandoff(doc);
      const parsed = protocol.parseHandoff(serialized);

      expect(parsed.goal).toBe(doc.goal);
      expect(parsed.status).toBe(doc.status);
      expect(parsed.meta.session).toBe('s1');
      expect(parsed.filesModified).toHaveLength(1);
      expect(parsed.filesModified[0].path).toBe('src/a.ts');
    });

    it('serializes decisions and next steps', () => {
      const events = [
        makeEvent('user_request', { text: 'task', mode: 'code' }),
        makeEvent('verified', {
          agentId: 'reviewer',
          verdict: 'pass',
          findings: [{ description: 'looks good', severity: 'low', evidence: 'n/a' }],
        }),
        makeEvent('final_response', { status: 'done', cost: 0, agentCount: 1 }),
      ];
      const doc = protocol.createCompactingHandoff(events);
      const serialized = protocol.serializeHandoff(doc);
      expect(serialized).toContain('decisions:');
      expect(serialized).toContain('Review verdict: pass');
    });
  });

  describe('serializeDelta / parseDelta', () => {
    it('round-trips a delta', () => {
      const delta = {
        base: 'base-1',
        progressDelta: 'Added new file',
        decisionsAdded: [{ decision: 'Use X', rationale: 'fast', source: 'agent', confidence: 'high' }],
        nextUpdated: [{ priority: 'HIGH' as const, action: 'Deploy' }],
        filesModifiedAdded: [{ path: 'src/b.ts', status: 'added', lines: 50 }],
        claimsAdded: ['claim-1'],
      };

      const serialized = protocol.serializeDelta(delta);
      const parsed = protocol.parseDelta(serialized);

      expect(parsed.base).toBe('base-1');
      expect(parsed.progressDelta).toBe('Added new file');
      expect(parsed.decisionsAdded).toHaveLength(1);
      expect(parsed.decisionsAdded[0].decision).toBe('Use X');
      expect(parsed.nextUpdated).toHaveLength(1);
      expect(parsed.filesModifiedAdded).toHaveLength(1);
      expect(parsed.claimsAdded).toEqual(['claim-1']);
    });
  });

  describe('validateHandoff', () => {
    it('validates a correct handoff', () => {
      const events = [
        makeEvent('user_request', { text: 'task', mode: 'code' }),
        makeEvent('final_response', { status: 'done', cost: 0, agentCount: 1 }),
      ];
      const doc = protocol.createCompactingHandoff(events, { session: 's1' });
      const checklist = protocol.validateHandoff(doc);

      expect(checklist.dataComplete).toBe(true);
      expect(checklist.claimsVerified).toBe(true);
      expect(checklist.capabilityMatch).toBe(true);
    });

    it('catches missing required fields', () => {
      const doc = {
        goal: '',
        status: 'in_progress',
        progress: '',
        decisions: [],
        next: [],
        context: [],
        filesModified: [],
        filesRead: [],
        errors: [],
        meta: { session: '', agent: '', provider: '', ts: '', contextFill: 0, claims: [] },
      };
      const checklist = protocol.validateHandoff(doc);
      expect(checklist.dataComplete).toBe(false);
    });
  });

  describe('claim management', () => {
    it('addClaim / getClaim / getAllClaims', () => {
      const p1 = makeProposal({ claimId: 'c1' });
      const p2 = makeProposal({ claimId: 'c2' });

      protocol.addClaim(p1);
      protocol.addClaim(p2);

      expect(protocol.getClaim('c1')).toEqual(p1);
      expect(protocol.getClaim('c2')).toEqual(p2);
      expect(protocol.getAllClaims()).toHaveLength(2);
    });

    it('returns undefined for unknown claim', () => {
      expect(protocol.getClaim('nonexistent')).toBeUndefined();
    });
  });

  describe('checkpoint management', () => {
    it('addCheckpoint / getCheckpoints', () => {
      protocol.addCheckpoint(0, 'Start');
      protocol.addCheckpoint(5, 'Halfway');
      protocol.addCheckpoint(10, 'Done');

      const checkpoints = protocol.getCheckpoints();
      expect(checkpoints).toHaveLength(3);
      expect(checkpoints[0]).toEqual({ index: 0, description: 'Start' });
      expect(checkpoints[2]).toEqual({ index: 10, description: 'Done' });
    });

    it('returns a copy of checkpoints', () => {
      protocol.addCheckpoint(0, 'Start');
      const first = protocol.getCheckpoints();
      const second = protocol.getCheckpoints();
      expect(first).not.toBe(second);
      expect(first).toEqual(second);
    });
  });
});
