import { randomUUID } from 'node:crypto';
import type { Checkpoint, CheckpointId, RunId, SessionId } from '@chimera/domain';

/**
 * CheckpointManager — durable state creation and recovery.
 */
export class CheckpointManager {
  private checkpoints: Map<CheckpointId, Checkpoint> = new Map();
  private runCheckpoints: Map<RunId, CheckpointId[]> = new Map();

  /**
   * Create a checkpoint.
   */
  createCheckpoint(
    runId: RunId,
    sessionId: SessionId,
    reason: string,
    state: {
      objective: string;
      currentPlan: string;
      completedWork: string[];
      filesChanged: string[];
      commandsRun: string[];
      testResults: Record<string, unknown>;
      knownFailures: string[];
      openQuestions: string[];
      constraints: Record<string, unknown>;
      nextActions: string[];
      relevantContext: string[];
    },
  ): CheckpointId {
    const id = randomUUID();
    const checkpoint: Checkpoint = {
      id,
      runId,
      sessionId,
      reason: reason as Checkpoint['reason'],
      createdAt: Date.now(),
      state,
      tokenCount: 0,
      valid: true,
    };
    this.checkpoints.set(id, checkpoint);
    const runList = this.runCheckpoints.get(runId) ?? [];
    runList.push(id);
    this.runCheckpoints.set(runId, runList);
    return id;
  }

  /**
   * Get a checkpoint by ID.
   */
  getCheckpoint(checkpointId: CheckpointId): Checkpoint | null {
    return this.checkpoints.get(checkpointId) ?? null;
  }

  /**
   * Get the latest checkpoint for a run.
   */
  getLatestCheckpoint(runId: RunId): Checkpoint | null {
    const runList = this.runCheckpoints.get(runId);
    if (!runList || runList.length === 0) return null;
    const latestId = runList[runList.length - 1];
    return this.checkpoints.get(latestId) ?? null;
  }

  /**
   * Restore from a checkpoint (marks it as valid).
   */
  restoreFromCheckpoint(checkpointId: CheckpointId): boolean {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) return false;
    checkpoint.valid = true;
    return true;
  }

  /**
   * Invalidate all checkpoints for a run.
   */
  invalidateCheckpoints(runId: RunId): void {
    const runList = this.runCheckpoints.get(runId);
    if (!runList) return;
    for (const id of runList) {
      const cp = this.checkpoints.get(id);
      if (cp) cp.valid = false;
    }
  }

  /**
   * List all checkpoints for a run.
   */
  listCheckpoints(runId: RunId): Checkpoint[] {
    const runList = this.runCheckpoints.get(runId) ?? [];
    return runList.map((id) => this.checkpoints.get(id)).filter((cp): cp is Checkpoint => cp !== undefined);
  }
}
