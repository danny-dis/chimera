import type { MemoryItem, MemoryQuery, MemoryResult, EmbeddingProvider } from './types.js';
export interface LongTermMemoryConfig {
    storagePath?: string;
    embeddingProvider?: EmbeddingProvider;
    decayHalfLifeDays?: number;
    maxMemories?: number;
}
/**
 * Three-tier long-term memory with semantic retrieval, decay, and summarization.
 *
 * - write: store a new fact with metadata
 * - retrieve: semantic search by similarity
 * - forget: delete by id or topic
 * - decay: reduce importance of old memories
 * - summarize: compress many memories into a single summary
 */
export declare class LongTermMemory {
    private store;
    private storagePath;
    private decayHalfLifeMs;
    private maxMemories;
    constructor(config?: LongTermMemoryConfig);
    /**
     * Store a new memory item.
     */
    write(params: {
        content: string;
        topic: string;
        importance?: number;
        source?: MemoryItem['metadata']['source'];
        sessionId?: string;
        tags?: string[];
    }): Promise<MemoryItem>;
    /**
     * Retrieve memories by semantic similarity.
     */
    retrieve(query: MemoryQuery): Promise<MemoryResult[]>;
    /**
     * Delete a memory by id.
     */
    forget(id: string): boolean;
    /**
     * Delete all memories matching a topic.
     */
    forgetByTopic(topic: string): number;
    /**
     * Reduce importance of old memories based on age.
     * Uses exponential decay with configurable half-life.
     */
    decay(): number;
    /**
     * Remove memories that have decayed below a threshold.
     */
    prune(minImportance?: number): number;
    /**
     * Compress multiple related memories into a single summary memory.
     * Returns the new summary memory item.
     */
    summarize(params: {
        topic: string;
        summaryContent: string;
        sourceMemoryIds?: string[];
        importance?: number;
    }): Promise<MemoryItem>;
    /**
     * Get all memories (for inspection/debugging).
     */
    getAll(): MemoryItem[];
    /**
     * Get count of stored memories.
     */
    size(): number;
    private evictIfNeeded;
    private saveToDisk;
    private loadFromDisk;
}
//# sourceMappingURL=long-term-memory.d.ts.map