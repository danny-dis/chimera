"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TfIdfEmbeddingProvider = void 0;
class TfIdfEmbeddingProvider {
    state = { vocab: new Map(), idf: new Map(), docCount: 0 };
    constructor(documents = []) {
        if (documents.length > 0) {
            this.buildVocab(documents);
        }
    }
    async embed(text) {
        const tokens = this.tokenize(text);
        const tf = this.computeTf(tokens);
        return this.toVector(tf);
    }
    async embedBatch(texts) {
        return Promise.all(texts.map(t => this.embed(t)));
    }
    buildVocab(documents) {
        const df = new Map();
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
    tokenize(text) {
        return text
            .toLowerCase()
            .split(/[^a-z0-9_]+/)
            .filter(t => t.length > 1 && t.length < 50);
    }
    computeTf(tokens) {
        const tf = new Map();
        for (const t of tokens) {
            tf.set(t, (tf.get(t) ?? 0) + 1);
        }
        const max = Math.max(...tf.values(), 1);
        for (const [k, v] of tf) {
            tf.set(k, v / max);
        }
        return tf;
    }
    toVector(tf) {
        const dim = this.state.vocab.size;
        const vec = new Array(dim).fill(0);
        for (const [term, freq] of tf) {
            const idx = this.state.vocab.get(term);
            if (idx !== undefined) {
                vec[idx] = freq * (this.state.idf.get(term) ?? 1);
            }
        }
        return vec;
    }
}
exports.TfIdfEmbeddingProvider = TfIdfEmbeddingProvider;
//# sourceMappingURL=embedding-provider.js.map