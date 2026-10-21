// =============================================================================
// CheckpointRecovery — handles crash recovery and resumability for long runs.
// Integrates with CheckpointManager and HandoffProtocol to enable
// resuming from valid checkpoints without replaying completed work.
// =============================================================================

import type { Checkpoint, CheckpointId, RunId, SessionId } from '@chimera/domain';

export interface RecoveryResult {
  recovered: boolean;
  checkpointId?: CheckpointId;
  reason?: string;
  state?: Checkpoint['state'];
}

export interface CheckpointSummary {
  total: number;
  valid: number;
  invalid: number;
  latest?: Checkpoint;
  byReason: Record<string, number>;
}

/**
 * CheckpointRecovery — manages run recovery and resumability.
 */
export class CheckpointRecovery {
  private checkpoints = new Map<CheckpointId, Checkpoint>();
  private runCheckpoints = new Map<RunId, CheckpointId[]>();
  private sessionRuns = new Map<SessionId, RunId[]>();

  /**
   * Register a checkpoint.
   */
  registerCheckpoint(checkpoint: Checkpoint): void {
    this.checkpoints.set(checkpoint.id, checkpoint);
    const runList = this.runCheckpoints.get(checkpoint.runId) ?? [];
    if (!runList.includes(checkpoint.id)) {
      runList.push(checkpoint.id);
      this.runCheckpoints.set(checkpoint.runId, runList);
    }
    const sessionList = this.sessionRuns.get(checkpoint.sessionId) ?? [];
    if (!sessionList.includes(checkpoint.runId)) {
      sessionList.push(checkpoint.runId);
      this.sessionRuns.set(checkpoint.sessionId, sessionList);
    }
  }

  /**
   * Attempt to recover a run from its latest valid checkpoint.
   */
  recoverRun(runId: RunId): RecoveryResult {
    const checkpointIds = this.runCheckpoints.get(runId);
    if (!checkpointIds || checkpointIds.length === 0) {
      return { recovered: false, reason: 'No checkpoints found for run' };
    }

    // Find the latest valid checkpoint
    for (let i = checkpointIds.length - 1; i >= 0; i--) {
      const cp = this.checkpoints.get(checkpointIds[i]);
      if (cp && cp.valid) {
        return {
          recovered: true,
          checkpointId: cp.id,
          state: cp.state,
        };
      }
    }

    return { recovered: false, reason: 'No valid checkpoints found' };
  }

  /**
   * Attempt to recover a session from its latest valid checkpoint.
   */
  recoverSession(sessionId: SessionId): RecoveryResult {
    const runIds = this.sessionRuns.get(sessionId);
    if (!runIds || runIds.length === 0) {
      return { recovered: false, reason: 'No runs found for session' };
    }

    // Find the latest valid checkpoint across all runs
    let latestCheckpoint: Checkpoint | undefined;
    for (const runId of runIds) {
      const checkpointIds = this.runCheckpoints.get(runId) ?? [];
      for (let i = checkpointIds.length - 1; i >= 0; i--) {
        const cp = this.checkpoints.get(checkpointIds[i]);
        if (cp && cp.valid) {
          if (!latestCheckpoint || cp.createdAt > latestCheckpoint.createdAt) {
            latestCheckpoint = cp;
          }
          break;
        }
      }
    }

    if (latestCheckpoint) {
      return {
        recovered: true,
        checkpointId: latestCheckpoint.id,
        state: latestCheckpoint.state,
      };
    }

    return { recovered: false, reason: 'No valid checkpoints found in session' };
  }

  /**
   * Get a summary of all checkpoints.
   */
  getSummary(): CheckpointSummary {
    const checkpoints = [...this.checkpoints.values()];
    const byReason: Record<string, number> = {};
    for (const cp of checkpoints) {
      byReason[cp.reason] = (byReason[cp.reason] ?? 0) + 1;
    }

    let latest: Checkpoint | undefined;
    for (const cp of checkpoints) {
      if (!latest || cp.createdAt > latest.createdAt) {
        latest = cp;
      }
    }

    return {
      total: checkpoints.length,
      valid: checkpoints.filter((cp) => cp.valid).length,
      invalid: checkpoints.filter((cp) => !cp.valid).length,
      latest,
      byReason,
    };
  }

  /**
   * Get all checkpoints for a run.
   */
  getCheckpointsForRun(runId: RunId): Checkpoint[] {
    const ids = this.runCheckpoints.get(runId) ?? [];
    return ids.map((id) => this.checkpoints.get(id)).filter((cp): cp is Checkpoint => cp !== undefined);
  }

  /**
   * Invalidate all checkpoints for a run.
   */
  invalidateRun(runId: RunId): void {
    const ids = this.runCheckpoints.get(runId) ?? [];
    for (const id of ids) {
      const cp = this.checkpoints.get(id);
      if (cp) cp.valid = false;
    }
  }

  /**
   * Check if a run can be resumed.
   */
  canResume(runId: RunId): boolean {
    const result = this.recoverRun(runId);
    return result.recovered;
  }

  /**
   * Get the latest checkpoint for a run.
   */
  getLatestCheckpoint(runId: RunId): Checkpoint | undefined {
    const ids = this.runCheckpoints.get(runId);
    if (!ids || ids.length === 0) return undefined;
    return this.checkpoints.get(ids[ids.length - 1]);
  }
}
