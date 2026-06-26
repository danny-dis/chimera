export type AgentMemoryType = 'observation' | 'fact' | 'preference' | 'pattern';
export interface AgentMemoryItem {
    id: string;
    agentId: string;
    content: string;
    type: AgentMemoryType;
    confidence: number;
    createdAt: number;
    expiresAt?: number;
}
export interface AgentMemoryQuery {
    agentId?: string;
    type?: AgentMemoryType;
    minConfidence?: number;
    limit?: number;
}
export interface AgentMemorySnapshot {
    id: string;
    agentId: string;
    shortTerm: AgentMemoryItem[];
    longTerm: AgentMemoryItem[];
    createdAt: number;
}
export declare class AgentMemory {
    private shortTerm;
    private longTerm;
    private snapshots;
    private static readonly PROMOTION_THRESHOLD;
    private static readonly SHORT_TERM_MAX;
    /**
     * Record an observation for an agent.
     * Items are added to short-term memory and promoted to long-term
     * when confidence exceeds the threshold. Expired items are pruned.
     */
    recordObservation(agentId: string, observation: Omit<AgentMemoryItem, 'id' | 'createdAt'>): Promise<void>;
    /**
     * Create a point-in-time snapshot for an agent's memory state.
     */
    createSnapshot(agentId: string): Promise<AgentMemorySnapshot>;
    /**
     * Restore short-term and long-term memory from a snapshot.
     * Only memories belonging to the snapshot's agentId are restored.
     */
    restoreFromSnapshot(snapshotId: string): Promise<void>;
    /**
     * Query memories across short-term and long-term storage.
     * Filters by agentId, type, and minimum confidence.
     * Results are sorted by confidence descending and limited.
     */
    queryMemory(query: AgentMemoryQuery): Promise<AgentMemoryItem[]>;
    /**
     * Remove items from short-term and long-term memory that have passed
     * their expiration time.
     */
    private pruneExpired;
}
//# sourceMappingURL=agent-memory.d.ts.map