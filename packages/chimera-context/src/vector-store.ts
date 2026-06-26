interface VectorEntry {
  id: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

export class VectorStore {
  private entries: VectorEntry[] = [];

  add(id: string, vector: number[], metadata: Record<string, unknown> = {}): void {
    this.entries.push({ id, vector, metadata });
  }

  clear(): void {
    this.entries = [];
  }

  search(query: number[], topK: number): Array<{ id: string; score: number }> {
    const scored = this.entries.map(entry => ({
      id: entry.id,
      score: cosineSimilarity(query, entry.vector),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
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
