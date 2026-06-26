export interface BoxedPayload {
    id: string;
    data: string;
    tokens: number;
    createdAt: number;
    ttlMs: number;
    metadata?: Record<string, unknown>;
}
export interface RelayReference {
    ref: string;
    sliceHint?: {
        start: number;
        end: number;
    };
}
export declare class ToolContextRelay {
    private store;
    private cleanupInterval;
    private config;
    constructor(params?: {
        defaultTtlMs?: number;
        maxStoreSize?: number;
        boxThreshold?: number;
    });
    box(data: string, options?: {
        ttlMs?: number;
        metadata?: Record<string, unknown>;
    }): RelayReference;
    unbox(ref: RelayReference): string | null;
    readSlice(ref: RelayReference, start: number, end: number): string | null;
    isRelayReference(value: string): boolean;
    extractReferences(text: string): RelayReference[];
    resolveReferences(text: string): string;
    cleanup(): number;
    getStats(): {
        totalPayloads: number;
        totalTokens: number;
        oldestAge: number | null;
    };
    destroy(): void;
    private extractIdFromRef;
    private extractId;
    private isExpired;
    private evictOldestIfNeeded;
}
//# sourceMappingURL=tool-context-relay.d.ts.map