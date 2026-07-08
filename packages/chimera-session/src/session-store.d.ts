export interface Message {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
}
export interface Session {
    id: string;
    title: string;
    messages: Message[];
    createdAt: string;
    updatedAt: string;
}
export interface SessionSummary {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
}
export interface ListOptions {
    filter?: {
        searchTerm?: string;
        createdAfter?: string;
        createdBefore?: string;
    };
    offset?: number;
    limit?: number;
}
export interface StorageAdapter {
    persist(id: string, data: Session): Promise<void>;
    load(id: string): Promise<Session | null>;
    listAll(): Promise<Session[]>;
}
export declare class SessionStore {
    private cache;
    private adapter;
    constructor(adapter: StorageAdapter);
    saveSession(session: Session): Promise<void>;
    recoverSession(sessionId: string): Promise<Session | null>;
    listSessions(options?: ListOptions): Promise<SessionSummary[]>;
}
export declare class FileStorageAdapter implements StorageAdapter {
    private storePath;
    constructor(storePath: string);
    ensureDir(): Promise<void>;
    persist(id: string, data: Session): Promise<void>;
    load(id: string): Promise<Session | null>;
    listAll(): Promise<Session[]>;
}
//# sourceMappingURL=session-store.d.ts.map