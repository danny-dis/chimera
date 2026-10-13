// =============================================================================
// DurableExecution — facade coordinating all Phase 13 durable execution
// primitives: event log, snapshots, leases, retry, idempotency, recovery.
// =============================================================================

import { randomUUID } from 'node:crypto';
import type {
  Checkpoint,
  CheckpointId,
  RunId,
  SessionId,
  SessionStatus,
  RunStatus,
} from '@chimera/domain';
import { DurableEventLog, type DurableEvent } from './durable-event-log.js';
import { LeaseManager, type Lease } from './lease-manager.js';
import { RetryPolicy, type RetryPolicyOptions } from './retry-policy.js';
import { IdempotentExecutor } from './idempotent-executor.js';
import { RecoveryManager, type StaleRun, type RecoveryResult } from './recovery-manager.js';
import { DurableSessionState, type SessionSnapshot, type RunSnapshot } from './durable-session-state.js';
import type { CheckpointManager } from './checkpoint-manager.js';
import type { SessionStateStore } from './session-state-store.js';

export interface DurableExecutionOptions {
  /** Base directory for all durable state */
  baseDir: string;
  /** Lease TTL in ms */
  leaseTtlMs?: number;
  /** Auto-save interval in ms */
  autoSaveIntervalMs?: number;
  /** Max age for stale run recovery */
  maxStaleAgeMs?: number;
  /** Retry policy options */
  retryOptions?: Partial<RetryPolicyOptions>;
}

export interface ExecutionContext {
  runId: RunId;
  sessionId: SessionId;
  ownerId: string;
  lease: Lease;
}

/**
 * DurableExecution — the main entry point for durable execution.
 * 
 * Coordinates:
 * - Event logging (append-only, file-backed)
 * - Session state snapshots (periodic auto-save)
 * - Lease acquisition/heartbeat/release (stale-run detection)
 * - Retry with exponential backoff
 * - Idempotent task deduplication
 * - Recovery after restart
 */
export class DurableExecution {
  readonly eventLog: DurableEventLog;
  readonly leaseManager: LeaseManager;
  readonly retryPolicy: RetryPolicy;
  readonly idempotentExecutor: IdempotentExecutor;
  readonly recoveryManager: RecoveryManager;
  readonly sessionState: DurableSessionState;
  private options: DurableExecutionOptions;

  constructor(
    options: DurableExecutionOptions,
    dependencies: {
      checkpointManager: CheckpointManager;
      sessionStateStore: SessionStateStore;
    },
  ) {
    this.options = options;
    const { baseDir } = options;

    this.eventLog = new DurableEventLog({ logDir: `${baseDir}/events` });
    this.leaseManager = new LeaseManager({ leaseTtlMs: options.leaseTtlMs });
    this.retryPolicy = new RetryPolicy(options.retryOptions);
    this.idempotentExecutor = new IdempotentExecutor({ recordDir: `${baseDir}/idempotent` });
    this.sessionState = new DurableSessionState({ snapshotDir: `${baseDir}/snapshots` });
    this.recoveryManager = new RecoveryManager({
      eventLog: this.eventLog,
      leaseManager: this.leaseManager,
      checkpointManager: dependencies.checkpointManager,
      sessionState: dependencies.sessionStateStore,
      maxStaleAgeMs: options.maxStaleAgeMs,
    });
  }

  /**
   * Initialize: create directories, replay event log, start background processes.
   */
  init(): void {
    this.eventLog.init();
    this.leaseManager.start();
  }

  /**
   * Shutdown: stop background processes.
   */
  shutdown(): void {
    this.leaseManager.stop();
    this.sessionState.stopAutoSave();
  }

  /**
   * Start a new run with a lease and initial event.
   */
  startRun(sessionId: SessionId, ownerId: string, strategy: string): ExecutionContext {
    const runId = randomUUID();
    const lease = this.leaseManager.acquireLease(runId, ownerId);
    if (!lease) {
      throw new Error(`Could not acquire lease for run ${runId}`);
    }
    this.eventLog.append('run_started', sessionId, { runId, strategy, ownerId }, runId);
    return { runId, sessionId, ownerId, lease };
  }

  /**
   * Heartbeat to keep a run's lease alive.
   */
  heartbeat(context: ExecutionContext): boolean {
    return this.leaseManager.heartbeat(context.runId, context.ownerId);
  }

  /**
   * Log an event for a run.
   */
  logEvent(
    context: ExecutionContext,
    type: string,
    payload: Record<string, unknown>,
  ): DurableEvent {
    return this.eventLog.append(type, context.sessionId, payload, context.runId);
  }

  /**
   * Complete a run: release lease, log completion.
   */
  completeRun(context: ExecutionContext, result: Record<string, unknown>): void {
    this.leaseManager.releaseLease(context.runId, context.ownerId);
    this.eventLog.append('run_completed', context.sessionId, {
      runId: context.runId,
      ...result,
    }, context.runId);
  }

  /**
   * Fail a run: release lease, log failure.
   */
  failRun(context: ExecutionContext, error: string): void {
    this.leaseManager.releaseLease(context.runId, context.ownerId);
    this.eventLog.append('run_failed', context.sessionId, {
      runId: context.runId,
      error,
    }, context.runId);
  }

  /**
   * Execute a task with retry, idempotency, and event logging.
   */
  async executeTask<T>(
    context: ExecutionContext,
    taskKey: string,
    fn: () => Promise<T>,
    options?: { force?: boolean; ttlMs?: number },
  ): Promise<T> {
    return this.idempotentExecutor.execute(taskKey, async () => {
      return this.retryPolicy.execute(fn);
    }, options);
  }

  /**
   * Run recovery: find stale runs and return resumable ones.
   */
  recover(): RecoveryResult {
    return this.recoveryManager.recover();
  }

  /**
   * Save a session state snapshot.
   */
  saveSnapshot(
    sessionId: SessionId,
    status: SessionStatus,
    activeRunId: RunId | null,
    runs: RunSnapshot[],
  ): void {
    this.sessionState.saveSnapshot({
      id: sessionId,
      status,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      activeRunId,
      runs,
      savedAt: Date.now(),
    });
  }

  /**
   * Get the latest checkpoint for a run.
   */
  getRecoveryCheckpoint(runId: RunId): Checkpoint | null {
    return this.recoveryManager.getRecoveryCheckpoint(runId);
  }

  /**
   * Get events for a run since a sequence number.
   */
  getEventsSince(runId: RunId, seq: number): DurableEvent[] {
    return this.recoveryManager.getEventsSince(runId, seq);
  }
}
