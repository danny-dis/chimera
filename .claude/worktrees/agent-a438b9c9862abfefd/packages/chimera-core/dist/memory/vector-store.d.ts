import type { MemoryItem, MemoryResult, MemoryQuery, EmbeddingProvider } from './types.js';
/**
 * Local embedding provider using character n-gram hashing.
 * Produces deterministic vectors without external API calls.
 * Dimension: 256 by default.
 */
export declare class LocalEmbeddingProvider implements EmbeddingProvider {
    private readonly dim;
    constructor(dimension?: number);
    dimension(): number;
    embed(text: string): Promise<number[]>;
    private tokenize;
    private fnv1a;
}
/**
 * In-memory vector store with cosine similarity search.
 */
export declare class VectorStore {
    private items;
    private embeddingProvider;
    constructor(embeddingProvider?: EmbeddingProvider);
    getEmbeddingProvider(): EmbeddingProvider;
    add(item: Omit<MemoryItem, 'embedding'>): Promise<MemoryItem>;
    search(query: MemoryQuery): Promise<MemoryResult[]>;
    remove(id: string): boolean;
    get(id: string): MemoryItem | undefined;
    getAll(): MemoryItem[];
    size(): number;
    clear(): void;
    /**
     * Serialize all items (without embeddings) for persistence.
     */
    serialize(): string;
    /**
     * Load items from serialized data, recomputing embeddings.
     */
    deserialize(data: string): Promise<void>;
}
//# sourceMappingURL=vector-store.d.ts.map