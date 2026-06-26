import type { MemoryItem, MemoryResult, MemoryQuery, EmbeddingProvider } from './types.js';

/**
 * Local embedding provider using character n-gram hashing.
 * Produces deterministic vectors without external API calls.
 * Dimension: 256 by default.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  private readonly dim: number;

  constructor(dimension = 256) {
    this.dim = dimension;
  }

  dimension(): number {
    return this.dim;
  }

  async embed(text: string): Promise<number[]> {
    const vec = new Float64Array(this.dim);
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const tokens = this.tokenize(normalized);

    for (const token of tokens) {
      const hash = this.fnv1a(token);
      const idx = Math.abs(hash) % this.dim;
      const sign = (hash & 1) === 0 ? 1 : -1;
      vec[idx] += sign;
    }

    // L2 normalize
    let norm = 0;
    for (let i = 0; i < this.dim; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dim; i++) vec[i] /= norm;
    }

    return Array.from(vec);
  }

  private tokenize(text: string): string[] {
    const tokens: string[] = [];
    // Word-level tokens
    for (const word of text.split(/\W+/).filter(Boolean)) {
      tokens.push(word);
      // Character trigrams
      if (word.length >= 3) {
        for (let i = 0; i <= word.length - 3; i++) {
          tokens.push(word.slice(i, i + 3));
        }
      }
    }
    return tokens;
  }

  private fnv1a(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash | 0;
  }
}

/**
 * In-memory vector store with cosine similarity search.
 */
export class VectorStore {
  private items: MemoryItem[] = [];
  private embeddingProvider: EmbeddingProvider;

  constructor(embeddingProvider?: EmbeddingProvider) {
    this.embeddingProvider = embeddingProvider ?? new LocalEmbeddingProvider();
  }

  getEmbeddingProvider(): EmbeddingProvider {
    return this.embeddingProvider;
  }

  async add(item: Omit<MemoryItem, 'embedding'>): Promise<MemoryItem> {
    const embedding = await this.embeddingProvider.embed(item.content);
    const fullItem: MemoryItem = { ...item, embedding };
    this.items.push(fullItem);
    return fullItem;
  }

  async search(query: MemoryQuery): Promise<MemoryResult[]> {
    const queryEmbedding = await this.embeddingProvider.embed(query.text);
    const topK = query.topK ?? 10;
    const threshold = query.threshold ?? 0.0;

    let candidates = this.items;

    // Apply filters
    if (query.topicFilter) {
      candidates = candidates.filter((item) => item.metadata.topic === query.topicFilter);
    }
    if (query.tagsFilter && query.tagsFilter.length > 0) {
      candidates = candidates.filter((item) =>
        query.tagsFilter!.some((tag) => item.metadata.tags.includes(tag)),
      );
    }
    if (query.since) {
      candidates = candidates.filter((item) => item.metadata.createdAt >= query.since!);
    }

    // Score and rank
    const results: MemoryResult[] = [];
    for (const item of candidates) {
      const score = cosineSimilarity(queryEmbedding, item.embedding);
      if (score >= threshold) {
        results.push({ item, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  remove(id: string): boolean {
    const idx = this.items.findIndex((item) => item.id === id);
    if (idx === -1) return false;
    this.items.splice(idx, 1);
    return true;
  }

  get(id: string): MemoryItem | undefined {
    return this.items.find((item) => item.id === id);
  }

  getAll(): MemoryItem[] {
    return [...this.items];
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }

  /**
   * Serialize all items (without embeddings) for persistence.
   */
  serialize(): string {
    return JSON.stringify(
      this.items.map(({ embedding, ...rest }) => rest),
      null,
      2,
    );
  }

  /**
   * Load items from serialized data, recomputing embeddings.
   */
  async deserialize(data: string): Promise<void> {
    const parsed = JSON.parse(data) as Array<Omit<MemoryItem, 'embedding'>>;
    this.items = [];
    for (const item of parsed) {
      await this.add(item);
    }
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
