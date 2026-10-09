import { describe, it, expect, beforeEach } from 'vitest';
import { CheckpointRecovery } from './checkpoint-recovery.js';
import type { Checkpoint } from '@chimera/domain';

function createCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: overrides.id ?? `cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    runId: overrides.runId ?? 'run-1',
    sessionId: overrides.sessionId ?? 'session-1',
    reason: overrides.reason ?? 'manual',
    createdAt: overrides.createdAt ?? Date.now(),
    state: overrides.state ?? {
      objective: 'test',
      currentPlan: '',
      completedWork: [],
      filesChanged: [],
      commandsRun: [],
      testResults: {},
      knownFailures: [],
      openQuestions: [],
      constraints: {},
      nextActions: [],
      relevantContext: [],
    },
    tokenCount: 0,
    valid: overrides.valid ?? true,
  };
}

describe('CheckpointRecovery', () => {
  let recovery: CheckpointRecovery;

  beforeEach(() => {
    recovery = new CheckpointRecovery();
  });

  describe('registerCheckpoint', () => {
    it('registers a checkpoint', () => {
      const cp = createCheckpoint();
      recovery.registerCheckpoint(cp);
      expect(recovery.getCheckpointsForRun('run-1')).toHaveLength(1);
    });

    it('tracks multiple checkpoints per run', () => {
      recovery.registerCheckpoint(createCheckpoint({ id: 'cp-1' }));
      recovery.registerCheckpoint(createCheckpoint({ id: 'cp-2' }));
      expect(recovery.getCheckpointsForRun('run-1')).toHaveLength(2);
    });
  });

  describe('recoverRun', () => {
    it('recovers from latest valid checkpoint', () => {
      recovery.registerCheckpoint(createCheckpoint({ id: 'cp-1', valid: false }));
      recovery.registerCheckpoint(createCheckpoint({ id: 'cp-2', valid: true }));
      const result = recovery.recoverRun('run-1');
      expect(result.recovered).toBe(true);
      expect(result.checkpointId).toBe('cp-2');
    });

    it('returns false when no checkpoints exist', () => {
      const result = recovery.recoverRun('nonexistent');
      expect(result.recovered).toBe(false);
    });

    it('returns false when all checkpoints are invalid', () => {
      recovery.registerCheckpoint(createCheckpoint({ id: 'cp-1', valid: false }));
      recovery.registerCheckpoint(createCheckpoint({ id: 'cp-2', valid: false }));
      const result = recovery.recoverRun('run-1');
      expect(result.recovered).toBe(false);
    });
  });

  describe('recoverSession', () => {
    it('recovers session from latest valid checkpoint', () => {
      recovery.registerCheckpoint(createCheckpoint({
        id: 'cp-1',
        runId: 'run-1',
        sessionId: 'session-1',
        valid: true,
      }));
      recovery.registerCheckpoint(createCheckpoint({
        id: 'cp-2',
        runId: 'run-2',
        sessionId: 'session-1',
        valid: true,
      }));
      const result = recovery.recoverSession('session-1');
      expect(result.recovered).toBe(true);
    });

    it('returns false when no runs exist', () => {
      const result = recovery.recoverSession('nonexistent');
      expect(result.recovered).toBe(false);
    });
  });

  describe('getSummary', () => {
    it('returns checkpoint summary', () => {
      recovery.registerCheckpoint(createCheckpoint({ id: 'cp-1', reason: 'manual', valid: true }));
      recovery.registerCheckpoint(createCheckpoint({ id: 'cp-2', reason: 'auto', valid: false }));
      recovery.registerCheckpoint(createCheckpoint({ id: 'cp-3', reason: 'manual', valid: true }));
      const summary = recovery.getSummary();
      expect(summary.total).toBe(3);
      expect(summary.valid).toBe(2);
      expect(summary.invalid).toBe(1);
      expect(summary.byReason.manual).toBe(2);
      expect(summary.byReason.auto).toBe(1);
    });
  });

  describe('invalidateRun', () => {
    it('invalidates all checkpoints for a run', () => {
      recovery.registerCheckpoint(createCheckpoint({ id: 'cp-1' }));
      recovery.registerCheckpoint(createCheckpoint({ id: 'cp-2' }));
      recovery.invalidateRun('run-1');
      const summary = recovery.getSummary();
      expect(summary.valid).toBe(0);
      expect(summary.invalid).toBe(2);
    });
  });

  describe('canResume', () => {
    it('returns true when valid checkpoint exists', () => {
      recovery.registerCheckpoint(createCheckpoint({ id: 'cp-1', valid: true }));
      expect(recovery.canResume('run-1')).toBe(true);
    });

    it('returns false when no valid checkpoint exists', () => {
      recovery.registerCheckpoint(createCheckpoint({ id: 'cp-1', valid: false }));
      expect(recovery.canResume('run-1')).toBe(false);
    });
  });

  describe('getLatestCheckpoint', () => {
    it('returns the latest checkpoint', () => {
      recovery.registerCheckpoint(createCheckpoint({ id: 'cp-1' }));
      recovery.registerCheckpoint(createCheckpoint({ id: 'cp-2' }));
      const latest = recovery.getLatestCheckpoint('run-1');
      expect(latest?.id).toBe('cp-2');
    });
  });
});
