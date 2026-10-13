// =============================================================================
// RecoveryManager — orchestrates recovery after a process restart.
// Coordinates checkpoint restoration, event log replay, and stale run
// detection/resumption.
// =============================================================================

import type { Checkpoint, CheckpointId, RunId, SessionId } from '@chimera/domain';
import type { DurableEventLog } from './durable-event-log.js';
import type { LeaseManager } from './lease-manager.js';
import type { CheckpointManager } from './checkpoint-manager.js';
import type { SessionStateStore } from './session-state-store.js';

export interface StaleRun {
  runId: RunId;
  sessionId: SessionId;
  lastEventSeq: number;
  lastEventType: string;
  lastEventTimestamp: number;
  hasValidCheckpoint: boolean;
  latestCheckpointId?: CheckpointId;
}

export interface RecoveryResult {
  recoveredRuns: StaleRun[];
  resumedRuns: RunId[];
  failedToRecover: RunId[];
}

export interface RecoveryManagerOptions {
  eventLog: DurableEventLog;
  leaseManager: LeaseManager;
  checkpointManager: CheckpointManager;
  sessionState: SessionStateStore;
  /** Maximum age of a stale run to attempt recovery (ms) */
  maxStaleAgeMs?: number;
}

/**
 * RecoveryManager — detects and recovers stale runs after restart.
 * 
 * On startup:
 * 1. Replays the event log to rebuild in-memory state
 * 2. Identifies runs that were active but have no valid lease
 * 3. For each stale run, finds the latest valid checkpoint
 * 4. Returns a list of runs available for resumption
 */
export class RecoveryManager {
  private eventLog: DurableEventLog;
  private leaseManager: LeaseManager;
  private checkpointManager: CheckpointManager;
  private sessionState: SessionStateStore;
  private maxStaleAgeMs: number;

  constructor(options: RecoveryManagerOptions) {
    this.eventLog = options.eventLog;
    this.leaseManager = options.leaseManager;
    this.checkpointManager = options.checkpointManager;
    this.sessionState = options.sessionState;
    this.maxStaleAgeMs = options.maxStaleAgeMs ?? 24 * 60 * 60 * 1000; // 24h
  }

  /**
   * Run recovery: scan event log for stale runs that need recovery.
   */
  recover(): RecoveryResult {
    const events = this.eventLog.getAll();
    const result: RecoveryResult = {
      recoveredRuns: [],
      resumedRuns: [],
      failedToRecover: [],
    };

    if (events.length === 0) {
      return result;
    }

    // Find all unique run IDs from the event log
    const runEvents = new Map<RunId, { sessionId: SessionId; events: typeof events }>();
    for (const event of events) {
      if (!event.runId) continue;
      const runId = event.runId;
      if (!runEvents.has(runId)) {
        runEvents.set(runId, { sessionId: event.sessionId, events: [] });
      }
      runEvents.get(runId)!.events.push(event);
    }

    // Check each run for staleness
    for (const [runId, { sessionId, events: runEvts }] of runEvents) {
      // Skip if the run has an active lease (someone else owns it)
      if (this.leaseManager.isLeased(runId)) {
        continue;
      }

      // Find the last event for this run
      const lastEvent = runEvts[runEvts.length - 1];
      const staleness = Date.now() - lastEvent.timestamp;

      // Only recover stale runs within the max age
      if (staleness > this.maxStaleAgeMs) {
        continue;
      }

      // Check if there's a valid checkpoint
      const latestCheckpoint = this.checkpointManager.getLatestCheckpoint(runId);
      const hasValidCheckpoint = latestCheckpoint?.valid === true;

      const staleRun: StaleRun = {
        runId,
        sessionId,
        lastEventSeq: lastEvent.seq,
        lastEventType: lastEvent.type,
        lastEventTimestamp: lastEvent.timestamp,
        hasValidCheckpoint,
        latestCheckpointId: latestCheckpoint?.id,
      };

      result.recoveredRuns.push(staleRun);

      // If we have a valid checkpoint, the run can be resumed
      if (hasValidCheckpoint) {
        result.resumedRuns.push(runId);
      } else {
        result.failedToRecover.push(runId);
      }
    }

    // Log recovery event via event log (EventBus uses ChimeraEvent union which doesn't include recovery events)
    if (result.recoveredRuns.length > 0) {
      this.eventLog.append('recovery_completed', this.sessionState.getSessionId(), {
        recoveredRuns: result.recoveredRuns.length,
        resumedRuns: result.resumedRuns.length,
        failedToRecover: result.failedToRecover.length,
      });
    }

    return result;
  }

  /**
   * Get the latest valid checkpoint for a run.
   */
  getRecoveryCheckpoint(runId: RunId): Checkpoint | null {
    const cp = this.checkpointManager.getLatestCheckpoint(runId);
    return cp?.valid ? cp : null;
  }

  /**
   * Get events for a run since a specific sequence number.
   * Useful for replaying events after a checkpoint.
   */
  getEventsSince(runId: RunId, seq: number): ReturnType<DurableEventLog['getSince']> {
    return this.eventLog.getSince(seq).filter(e => e.runId === runId);
  }

  /**
   * Mark a stale run as failed (no recovery possible).
   */
  markStaleFailed(runId: RunId): void {
    this.eventLog.append('run_status_changed', this.sessionState.getSessionId(), {
      runId,
      status: 'failed',
      reason: 'stale_run_no_checkpoint',
    }, runId);
  }
}
