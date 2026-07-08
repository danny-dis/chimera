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
export type SyncEventType = 'session.created' | 'session.updated' | 'session.deleted' | 'message.added' | 'message.updated' | 'state.changed';
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
export declare class SessionSynchronizer {
    private adapter;
    private clientId;
    private syncStates;
    private eventBuffer;
    private flushInterval;
    constructor(adapter: SyncAdapter, clientId?: string);
    /**
     * Start automatic flushing of events.
     */
    startAutoFlush(intervalMs?: number): void;
    /**
     * Stop automatic flushing.
     */
    stopAutoFlush(): void;
    /**
     * Record a sync event.
     */
    recordEvent(sessionId: string, type: SyncEventType, payload: unknown): void;
    /**
     * Record a message added event.
     */
    recordMessageAdded(sessionId: string, message: Message): void;
    /**
     * Record a session updated event.
     */
    recordSessionUpdated(sessionId: string, session: Partial<Session>): void;
    /**
     * Flush pending events to the sync adapter.
     */
    flush(): Promise<number>;
    /**
     * Pull and apply events from the sync adapter.
     */
    pull(sessionId: string): Promise<SyncEvent[]>;
    /**
     * Get sync state for a session.
     */
    getSyncState(sessionId: string): SessionSyncState | undefined;
    /**
     * Get the client ID.
     */
    getClientId(): string;
}
/**
 * File-based sync adapter for local multi-device sync.
 */
export declare class FileSyncAdapter implements SyncAdapter {
    private basePath;
    constructor(basePath: string);
    pushEvents(_events: SyncEvent[]): Promise<void>;
    pullEvents(_sessionId: string, _sinceSequence: number): Promise<SyncEvent[]>;
    getSyncState(_sessionId: string, _clientId: string): Promise<SessionSyncState | null>;
    updateSyncState(_state: SessionSyncState): Promise<void>;
}
/**
 * Create a session synchronizer with default file-based adapter.
 */
export declare function createSessionSynchronizer(basePath: string, clientId?: string): SessionSynchronizer;
//# sourceMappingURL=sync-protocol.d.ts.map