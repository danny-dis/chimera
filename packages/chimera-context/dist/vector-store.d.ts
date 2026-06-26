export declare class VectorStore {
    private entries;
    add(id: string, vector: number[], metadata?: Record<string, unknown>): void;
    clear(): void;
    search(query: number[], topK: number): Array<{
        id: string;
        score: number;
    }>;
}
//# sourceMappingURL=vector-store.d.ts.map