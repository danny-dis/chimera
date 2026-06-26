export interface MemoryItem {
    id: string;
    content: string;
    embedding: number[];
    metadata: MemoryMetadata;
}
export interface MemoryMetadata {
    topic: string;
    importance: number;
    createdAt: number;
    lastAccessedAt: number;
    accessCount: number;
    source: 'user' | 'agent' | 'system';
    sessionId?: string;
    tags: string[];
}
export interface MemoryQuery {
    text: string;
    topK?: number;
    threshold?: number;
    topicFilter?: string;
    tagsFilter?: string[];
    since?: number;
}
export interface MemoryResult {
    item: MemoryItem;
    score: number;
}
export interface EmbeddingProvider {
    embed(text: string): Promise<number[]>;
    dimension(): number;
}
//# sourceMappingURL=types.d.ts.map