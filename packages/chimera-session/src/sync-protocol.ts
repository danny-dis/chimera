/**
 * Session Sync Protocol
 *
 * Delta-sync protocol for synchronizing session state across devices.
 * Enables sessions to follow users from terminal → browser → phone.
 *
 * Modeled after Omnigent's session-follows-you pattern.
 */

import type { Session, Message } from './session-store.js';

/**
 * Sync event types for delta synchronization.
 */
export type SyncEventType =
  | 'session.created'
  | 'session.updated'
  | 'session.deleted'
  | 'message.added'
  | 'message.updated'
  | 'state.changed';

/**
 * A sync event representing a change to session state.
 */
export interface SyncEvent {
  id: string;
  sessionId: string;
  type: SyncEventType;
  timestamp: number;
  /** Sequence number for ordering (monotonically increasing per session) */
  sequence: number;
  /** Event payload */
  payload: unknown;
  /** Client ID that generated this event */
  clientId: string;
}

/**
 * Session sync state for a single session.
 */
export interface SessionSyncState {
  sessionId: string;
  /** Last sequence number received */
  lastSequence: number;
  /** Last sync timestamp */
  lastSyncAt: number;
  /** Client ID */
  clientId: string;
}

/**
 * Sync adapter interface for different storage backends.
 */
export interface SyncAdapter {
  /** Push events to the sync store */
  pushEvents(events: SyncEvent[]): Promise<void>;
  /** Pull events since a given sequence number */
  pullEvents(sessionId: string, sinceSequence: number): Promise<SyncEvent[]>;
  /** Get sync state for a session */
  getSyncState(sessionId: string, clientId: string): Promise<SessionSyncState | null>;
  /** Update sync state */
  updateSyncState(state: SessionSyncState): Promise<void>;
}

/**
 * SessionSynchronizer — handles delta sync across devices.
 */
export class SessionSynchronizer {
  private adapter: SyncAdapter;
  private clientId: string;
  private syncStates = new Map<string, SessionSyncState>();
  private eventBuffer: SyncEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(adapter: SyncAdapter, clientId?: string) {
    this.adapter = adapter;
    this.clientId = clientId ?? `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Start automatic flushing of events.
   */
  startAutoFlush(intervalMs = 1000): void {
    if (this.flushInterval) return;
    this.flushInterval = setInterval(() => {
      this.flush().catch(console.error);
    }, intervalMs);
  }

  /**
   * Stop automatic flushing.
   */
  stopAutoFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Record a sync event.
   */
  recordEvent(sessionId: string, type: SyncEventType, payload: unknown): void {
    const state = this.syncStates.get(sessionId);
    const sequence = (state?.lastSequence ?? 0) + 1;

    const event: SyncEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      type,
      timestamp: Date.now(),
      sequence,
      payload,
      clientId: this.clientId,
    };

    this.eventBuffer.push(event);

    // Update local state
    this.syncStates.set(sessionId, {
      sessionId,
      lastSequence: sequence,
      lastSyncAt: Date.now(),
      clientId: this.clientId,
    });
  }

  /**
   * Record a message added event.
   */
  recordMessageAdded(sessionId: string, message: Message): void {
    this.recordEvent(sessionId, 'message.added', { message });
  }

  /**
   * Record a session updated event.
   */
  recordSessionUpdated(sessionId: string, session: Partial<Session>): void {
    this.recordEvent(sessionId, 'session.updated', { session });
  }

  /**
   * Flush pending events to the sync adapter.
   */
  async flush(): Promise<number> {
    if (this.eventBuffer.length === 0) return 0;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      await this.adapter.pushEvents(events);

      // Update sync states
      for (const state of this.syncStates.values()) {
        await this.adapter.updateSyncState(state);
      }

      return events.length;
    } catch (error) {
      // Re-add failed events to buffer
      this.eventBuffer.unshift(...events);
      throw error;
    }
  }

  /**
   * Pull and apply events from the sync adapter.
   */
  async pull(sessionId: string): Promise<SyncEvent[]> {
    const state = this.syncStates.get(sessionId);
    const sinceSequence = state?.lastSequence ?? 0;

    const events = await this.adapter.pullEvents(sessionId, sinceSequence);

    // Apply events and update state
    for (const event of events) {
      if (event.sequence > (state?.lastSequence ?? 0)) {
        this.syncStates.set(sessionId, {
          sessionId,
          lastSequence: event.sequence,
          lastSyncAt: Date.now(),
          clientId: this.clientId,
        });
      }
    }

    return events;
  }

  /**
   * Get sync state for a session.
   */
  getSyncState(sessionId: string): SessionSyncState | undefined {
    return this.syncStates.get(sessionId);
  }

  /**
   * Get the client ID.
   */
  getClientId(): string {
    return this.clientId;
  }
}

/**
 * File-based sync adapter for local multi-device sync.
 */
export class FileSyncAdapter implements SyncAdapter {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async pushEvents(_events: SyncEvent[]): Promise<void> {
    // Implementation would write events to files
    // For now, this is a stub
  }

  async pullEvents(_sessionId: string, _sinceSequence: number): Promise<SyncEvent[]> {
    // Implementation would read events from files
    return [];
  }

  async getSyncState(_sessionId: string, _clientId: string): Promise<SessionSyncState | null> {
    return null;
  }

  async updateSyncState(_state: SessionSyncState): Promise<void> {
    // Implementation would persist sync state
  }
}

/**
 * Create a session synchronizer with default file-based adapter.
 */
export function createSessionSynchronizer(
  basePath: string,
  clientId?: string,
): SessionSynchronizer {
  const adapter = new FileSyncAdapter(basePath);
  return new SessionSynchronizer(adapter, clientId);
}
