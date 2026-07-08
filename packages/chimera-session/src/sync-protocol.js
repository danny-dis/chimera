/**
 * Session Sync Protocol
 *
 * Delta-sync protocol for synchronizing session state across devices.
 * Enables sessions to follow users from terminal → browser → phone.
 *
 * Modeled after Omnigent's session-follows-you pattern.
 */
/**
 * SessionSynchronizer — handles delta sync across devices.
 */
export class SessionSynchronizer {
    adapter;
    clientId;
    syncStates = new Map();
    eventBuffer = [];
    flushInterval = null;
    constructor(adapter, clientId) {
        this.adapter = adapter;
        this.clientId = clientId ?? `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    /**
     * Start automatic flushing of events.
     */
    startAutoFlush(intervalMs = 1000) {
        if (this.flushInterval)
            return;
        this.flushInterval = setInterval(() => {
            this.flush().catch(console.error);
        }, intervalMs);
    }
    /**
     * Stop automatic flushing.
     */
    stopAutoFlush() {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
    }
    /**
     * Record a sync event.
     */
    recordEvent(sessionId, type, payload) {
        const state = this.syncStates.get(sessionId);
        const sequence = (state?.lastSequence ?? 0) + 1;
        const event = {
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
    recordMessageAdded(sessionId, message) {
        this.recordEvent(sessionId, 'message.added', { message });
    }
    /**
     * Record a session updated event.
     */
    recordSessionUpdated(sessionId, session) {
        this.recordEvent(sessionId, 'session.updated', { session });
    }
    /**
     * Flush pending events to the sync adapter.
     */
    async flush() {
        if (this.eventBuffer.length === 0)
            return 0;
        const events = [...this.eventBuffer];
        this.eventBuffer = [];
        try {
            await this.adapter.pushEvents(events);
            // Update sync states
            for (const state of this.syncStates.values()) {
                await this.adapter.updateSyncState(state);
            }
            return events.length;
        }
        catch (error) {
            // Re-add failed events to buffer
            this.eventBuffer.unshift(...events);
            throw error;
        }
    }
    /**
     * Pull and apply events from the sync adapter.
     */
    async pull(sessionId) {
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
    getSyncState(sessionId) {
        return this.syncStates.get(sessionId);
    }
    /**
     * Get the client ID.
     */
    getClientId() {
        return this.clientId;
    }
}
/**
 * File-based sync adapter for local multi-device sync.
 */
export class FileSyncAdapter {
    basePath;
    constructor(basePath) {
        this.basePath = basePath;
    }
    async pushEvents(_events) {
        // Implementation would write events to files
        // For now, this is a stub
    }
    async pullEvents(_sessionId, _sinceSequence) {
        // Implementation would read events from files
        return [];
    }
    async getSyncState(_sessionId, _clientId) {
        return null;
    }
    async updateSyncState(_state) {
        // Implementation would persist sync state
    }
}
/**
 * Create a session synchronizer with default file-based adapter.
 */
export function createSessionSynchronizer(basePath, clientId) {
    const adapter = new FileSyncAdapter(basePath);
    return new SessionSynchronizer(adapter, clientId);
}
//# sourceMappingURL=sync-protocol.js.map