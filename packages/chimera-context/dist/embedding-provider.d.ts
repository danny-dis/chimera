export interface EmbeddingProvider {
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
}
export declare class TfIdfEmbeddingProvider implements EmbeddingProvider {
    private state;
    constructor(documents?: string[]);
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    private buildVocab;
    private tokenize;
    private computeTf;
    private toVector;
}
//# sourceMappingURL=embedding-provider.d.ts.map