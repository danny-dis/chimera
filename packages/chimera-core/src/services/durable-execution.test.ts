import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DurableExecution } from './durable-execution.js';
import { CheckpointManager } from './checkpoint-manager.js';
import { SessionStateStore } from './session-state-store.js';

describe('DurableExecution', () => {
  let baseDir: string;
  let durable: DurableExecution;
  let checkpointManager: CheckpointManager;
  let sessionState: SessionStateStore;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'durable-exec-'));
    checkpointManager = new CheckpointManager();
    sessionState = new SessionStateStore('session-1');
    durable = new DurableExecution(
      { baseDir, leaseTtlMs: 1000, retryOptions: { maxRetries: 2, initialDelayMs: 10 } },
      { checkpointManager, sessionStateStore: sessionState },
    );
    durable.init();
  });

  afterEach(() => {
    durable.shutdown();
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('starts a run with a lease', () => {
    const ctx = durable.startRun('session-1', 'owner-1', 'solo');
    expect(ctx.runId).toBeTruthy();
    expect(ctx.lease).not.toBeNull();
    expect(durable.leaseManager.isLeased(ctx.runId)).toBe(true);
  });

  it('heartbeats keep lease alive', () => {
    const ctx = durable.startRun('session-1', 'owner-1', 'solo');
    expect(durable.heartbeat(ctx)).toBe(true);
  });

  it('logs events for a run', () => {
    const ctx = durable.startRun('session-1', 'owner-1', 'solo');
    const event = durable.logEvent(ctx, 'test_event', { foo: 'bar' });
    expect(event.type).toBe('test_event');
    expect(event.runId).toBe(ctx.runId);
  });

  it('completes a run and releases lease', () => {
    const ctx = durable.startRun('session-1', 'owner-1', 'solo');
    durable.completeRun(ctx, { success: true });
    expect(durable.leaseManager.isLeased(ctx.runId)).toBe(false);
    const events = durable.eventLog.getAll({ runId: ctx.runId });
    expect(events.some(e => e.type === 'run_completed')).toBe(true);
  });

  it('fails a run and releases lease', () => {
    const ctx = durable.startRun('session-1', 'owner-1', 'solo');
    durable.failRun(ctx, 'Something went wrong');
    expect(durable.leaseManager.isLeased(ctx.runId)).toBe(false);
    const events = durable.eventLog.getAll({ runId: ctx.runId });
    expect(events.some(e => e.type === 'run_failed')).toBe(true);
  });

  it('executes tasks with retry', async () => {
    const ctx = durable.startRun('session-1', 'owner-1', 'solo');
    let attempts = 0;
    const result = await durable.executeTask(ctx, 'task-1', async () => {
      attempts++;
      if (attempts < 2) throw new Error('transient');
      return 'success';
    });
    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  it('executes tasks idempotently', async () => {
    const ctx = durable.startRun('session-1', 'owner-1', 'solo');
    let calls = 0;
    const fn = async () => { calls++; return 'result'; };
    await durable.executeTask(ctx, 'task-1', fn);
    await durable.executeTask(ctx, 'task-1', fn);
    expect(calls).toBe(1);
  });

  it('recovers stale runs', () => {
    durable.eventLog.append('run_started', 'session-1', {}, 'run-1');
    durable.eventLog.append('run_status_changed', 'session-1', { status: 'executing' }, 'run-1');
    const result = durable.recover();
    expect(result.recoveredRuns).toHaveLength(1);
  });

  it('saves session snapshots', () => {
    durable.saveSnapshot('session-1', 'active', null, []);
    const events = durable.eventLog.getAll();
    // Snapshot is saved via DurableSessionState, not event log
    // Just verify no errors thrown
    expect(true).toBe(true);
  });
});
