import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RecoveryManager } from './recovery-manager.js';
import { DurableEventLog } from './durable-event-log.js';
import { LeaseManager } from './lease-manager.js';
import { CheckpointManager } from './checkpoint-manager.js';
import { SessionStateStore } from './session-state-store.js';


describe('RecoveryManager', () => {
  let eventLog: DurableEventLog;
  let leaseManager: LeaseManager;
  let checkpointManager: CheckpointManager;
  let sessionState: SessionStateStore;
  let recovery: RecoveryManager;
  let logDir: string;

  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), 'recovery-'));
    eventLog = new DurableEventLog({ logDir: `${logDir}/events` });
    eventLog.init();
    leaseManager = new LeaseManager({ leaseTtlMs: 1000, cleanupIntervalMs: 100 });
    checkpointManager = new CheckpointManager();
    sessionState = new SessionStateStore('session-1');
    recovery = new RecoveryManager({
      eventLog,
      leaseManager,
      checkpointManager,
      sessionState,
    });
  });

  afterEach(() => {
    leaseManager.stop();
    rmSync(logDir, { recursive: true, force: true });
  });

  it('returns empty result when no events exist', () => {
    const result = recovery.recover();
    expect(result.recoveredRuns).toHaveLength(0);
  });

  it('detects stale runs without active leases', () => {
    eventLog.append('run_started', 'session-1', { strategy: 'solo' }, 'run-1');
    eventLog.append('run_status_changed', 'session-1', { status: 'executing' }, 'run-1');
    const result = recovery.recover();
    expect(result.recoveredRuns).toHaveLength(1);
    expect(result.recoveredRuns[0].runId).toBe('run-1');
  });

  it('skips runs with active leases', () => {
    eventLog.append('run_started', 'session-1', {}, 'run-1');
    leaseManager.acquireLease('run-1', 'owner-1');
    const result = recovery.recover();
    expect(result.recoveredRuns).toHaveLength(0);
  });

  it('identifies resumable runs with valid checkpoints', () => {
    eventLog.append('run_started', 'session-1', {}, 'run-1');
    checkpointManager.createCheckpoint('run-1', 'session-1', 'auto', {
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
    });
    const result = recovery.recover();
    expect(result.resumedRuns).toContain('run-1');
  });

  it('marks runs without checkpoints as failed to recover', () => {
    eventLog.append('run_started', 'session-1', {}, 'run-1');
    const result = recovery.recover();
    expect(result.failedToRecover).toContain('run-1');
  });

  it('gets recovery checkpoint for a run', () => {
    checkpointManager.createCheckpoint('run-1', 'session-1', 'auto', {
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
    });
    const cp = recovery.getRecoveryCheckpoint('run-1');
    expect(cp).not.toBeNull();
    expect(cp?.runId).toBe('run-1');
  });

  it('gets events since a sequence number', () => {
    eventLog.append('event_1', 'session-1', {}, 'run-1');
    eventLog.append('event_2', 'session-1', {}, 'run-1');
    eventLog.append('event_3', 'session-1', {}, 'run-1');
    const events = recovery.getEventsSince('run-1', 1);
    expect(events).toHaveLength(2);
  });
});
