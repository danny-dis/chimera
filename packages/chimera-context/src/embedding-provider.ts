export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

interface TfIdfState {
  vocab: Map<string, number>;
  idf: Map<string, number>;
  docCount: number;
}

export class TfIdfEmbeddingProvider implements EmbeddingProvider {
  private state: TfIdfState = { vocab: new Map(), idf: new Map(), docCount: 0 };

  constructor(documents: string[] = []) {
    if (documents.length > 0) {
      this.buildVocab(documents);
    }
  }

  async embed(text: string): Promise<number[]> {
    const tokens = this.tokenize(text);
    const tf = this.computeTf(tokens);
    return this.toVector(tf);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  private buildVocab(documents: string[]): void {
    const df = new Map<string, number>();
    this.state.docCount = documents.length;

    for (const doc of documents) {
      const unique = new Set(this.tokenize(doc));
      for (const token of unique) {
        df.set(token, (df.get(token) ?? 0) + 1);
      }
    }

    let idx = 0;
    for (const [term, count] of df) {
      this.state.vocab.set(term, idx++);
      this.state.idf.set(term, Math.log((documents.length + 1) / (count + 1)) + 1);
    }
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter(t => t.length > 1 && t.length < 50);
  }

  private computeTf(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }
    const max = Math.max(...tf.values(), 1);
    for (const [k, v] of tf) {
      tf.set(k, v / max);
    }
    return tf;
  }

  private toVector(tf: Map<string, number>): number[] {
    const dim = this.state.vocab.size;
    const vec = new Array<number>(dim).fill(0);
    for (const [term, freq] of tf) {
      const idx = this.state.vocab.get(term);
      if (idx !== undefined) {
        vec[idx] = freq * (this.state.idf.get(term) ?? 1);
      }
    }
    return vec;
  }
}
