"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStore = void 0;
class VectorStore {
    entries = [];
    add(id, vector, metadata = {}) {
        this.entries.push({ id, vector, metadata });
    }
    clear() {
        this.entries = [];
    }
    search(query, topK) {
        const scored = this.entries.map(entry => ({
            id: entry.id,
            score: cosineSimilarity(query, entry.vector),
        }));
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK);
    }
}
exports.VectorStore = VectorStore;
function cosineSimilarity(a, b) {
    if (a.length !== b.length || a.length === 0)
        return 0;
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
//# sourceMappingURL=vector-store.js.map