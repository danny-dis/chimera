// =============================================================================
// DurableSessionState — snapshot-based state persistence for sessions.
// Periodically saves session state to disk so it can survive restarts.
// =============================================================================

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { SessionId, RunId, SessionStatus, RunStatus } from '@chimera/domain';

export interface RunSnapshot {
  id: RunId;
  sessionId: SessionId;
  status: RunStatus;
  strategy: string;
  startedAt: number;
  costUsd: number;
  tokenCount: number;
  agentIds: string[];
  checkpointId: string | null;
}

export interface SessionSnapshot {
  id: SessionId;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
  activeRunId: RunId | null;
  runs: RunSnapshot[];
  savedAt: number;
}

export interface DurableSessionStateOptions {
  /** Directory to store snapshots */
  snapshotDir: string;
  /** How often to auto-save (ms) */
  autoSaveIntervalMs?: number;
}

const DEFAULT_OPTIONS = {
  autoSaveIntervalMs: 30_000, // 30s
};

/**
 * DurableSessionState — persists session state to disk via snapshots.
 * 
 * On startup, loads the latest snapshot to restore state.
 * Periodically saves state during operation.
 */
export class DurableSessionState {
  private readonly snapshotDir: string;
  private readonly autoSaveIntervalMs: number;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private snapshots: SessionSnapshot[] = [];

  constructor(options: DurableSessionStateOptions) {
    this.snapshotDir = resolve(options.snapshotDir);
    this.autoSaveIntervalMs = options.autoSaveIntervalMs ?? DEFAULT_OPTIONS.autoSaveIntervalMs;
    mkdirSync(this.snapshotDir, { recursive: true });
  }

  /**
   * Start auto-save timer.
   */
  startAutoSave(getState: () => SessionSnapshot): void {
    if (this.autoSaveTimer) return;
    this.autoSaveTimer = setInterval(() => {
      this.saveSnapshot(getState());
    }, this.autoSaveIntervalMs);
    if (typeof this.autoSaveTimer.unref === 'function') {
      this.autoSaveTimer.unref();
    }
  }

  /**
   * Stop auto-save timer.
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Save a snapshot to disk.
   */
  saveSnapshot(state: SessionSnapshot): void {
    const snapshot: SessionSnapshot = {
      ...state,
      savedAt: Date.now(),
    };
    const file = this.getSnapshotFile(snapshot.id);
    writeFileSync(file, JSON.stringify(snapshot, null, 2), 'utf-8');
    this.snapshots.push(snapshot);
  }

  /**
   * Load the latest snapshot for a session.
   */
  loadSnapshot(sessionId: SessionId): SessionSnapshot | null {
    const file = this.getSnapshotFile(sessionId);
    if (!existsSync(file)) return null;
    try {
      const content = readFileSync(file, 'utf-8');
      return JSON.parse(content) as SessionSnapshot;
    } catch {
      return null;
    }
  }

  /**
   * Load the latest snapshot across all sessions.
   */
  loadLatestSnapshot(): SessionSnapshot | null {
    const files = this.getSnapshotFiles();
    if (files.length === 0) return null;

    let latest: SessionSnapshot | null = null;
    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        const snapshot = JSON.parse(content) as SessionSnapshot;
        if (!latest || snapshot.savedAt > latest.savedAt) {
          latest = snapshot;
        }
      } catch {
        // Skip corrupted
      }
    }
    return latest;
  }

  /**
   * List all available snapshots.
   */
  listSnapshots(): SessionSnapshot[] {
    const files = this.getSnapshotFiles();
    const snapshots: SessionSnapshot[] = [];
    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        snapshots.push(JSON.parse(content) as SessionSnapshot);
      } catch {
        // Skip
      }
    }
    return snapshots;
  }

  /**
   * Delete a snapshot.
   */
  deleteSnapshot(sessionId: SessionId): boolean {
    const file = this.getSnapshotFile(sessionId);
    if (!existsSync(file)) return false;
    try {
      unlinkSync(file);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the file path for a session snapshot.
   */
  private getSnapshotFile(sessionId: SessionId): string {
    return resolve(this.snapshotDir, `session-${sessionId}.json`);
  }

  /**
   * Get all snapshot files.
   */
  private getSnapshotFiles(): string[] {
    if (!existsSync(this.snapshotDir)) return [];
    return readdirSync(this.snapshotDir)
      .filter((f: string) => f.startsWith('session-') && f.endsWith('.json'))
      .map((f: string) => resolve(this.snapshotDir, f));
  }
}
