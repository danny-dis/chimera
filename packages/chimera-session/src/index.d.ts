import type { ChimeraEvent, Mode } from '@chimera/core';
export type { Session, SessionSummary, ListOptions, StorageAdapter } from './session-store.js';
export { SessionStore as ConversationSessionStore, FileStorageAdapter } from './session-store.js';
export type { Message } from './session-store.js';
import type { Message } from './session-store.js';
export { SessionSynchronizer, FileSyncAdapter, createSessionSynchronizer, } from './sync-protocol.js';
export type { SyncEvent, SyncEventType, SessionSyncState, SyncAdapter, } from './sync-protocol.js';
export interface SessionCheckpoint {
    sessionId: string;
    timestamp: string;
    task: string;
    mode: Mode;
    messages: Message[];
    events: ChimeraEvent[];
    costSpend: Record<string, number>;
    metadata: {
        agentCount: number;
        turnCount: number;
        status: 'active' | 'completed' | 'failed';
    };
}
export interface CheckpointSummary {
    id: string;
    timestamp: string;
    task: string;
    mode: Mode;
    status: 'active' | 'completed' | 'failed';
    cost: number;
    turnCount: number;
}
export declare class CheckpointStore {
    private storePath;
    constructor(storePath?: string);
    ensureDir(): Promise<void>;
    generateSessionId(): string;
    save(checkpoint: SessionCheckpoint): Promise<string>;
    load(sessionId: string): Promise<SessionCheckpoint | null>;
    list(): Promise<CheckpointSummary[]>;
    delete(sessionId: string): Promise<boolean>;
    updateStatus(sessionId: string, status: SessionCheckpoint['metadata']['status']): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map