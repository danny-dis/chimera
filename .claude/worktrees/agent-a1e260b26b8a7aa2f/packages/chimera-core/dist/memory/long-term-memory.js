"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LongTermMemory = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const vector_store_js_1 = require("./vector-store.js");
/**
 * Three-tier long-term memory with semantic retrieval, decay, and summarization.
 *
 * - write: store a new fact with metadata
 * - retrieve: semantic search by similarity
 * - forget: delete by id or topic
 * - decay: reduce importance of old memories
 * - summarize: compress many memories into a single summary
 */
class LongTermMemory {
    store;
    storagePath;
    decayHalfLifeMs;
    maxMemories;
    constructor(config) {
        this.store = new vector_store_js_1.VectorStore(config?.embeddingProvider);
        this.storagePath = config?.storagePath ?? null;
        this.decayHalfLifeMs = (config?.decayHalfLifeDays ?? 30) * 24 * 60 * 60 * 1000;
        this.maxMemories = config?.maxMemories ?? 10_000;
        if (this.storagePath && (0, fs_1.existsSync)(this.storagePath)) {
            this.loadFromDisk();
        }
    }
    /**
     * Store a new memory item.
     */
    async write(params) {
        const id = crypto.randomUUID();
        const now = Date.now();
        const item = await this.store.add({
            id,
            content: params.content,
            metadata: {
                topic: params.topic,
                importance: params.importance ?? 0.5,
                createdAt: now,
                lastAccessedAt: now,
                accessCount: 0,
                source: params.source ?? 'agent',
                sessionId: params.sessionId,
                tags: params.tags ?? [],
            },
        });
        this.evictIfNeeded();
        this.saveToDisk();
        return item;
    }
    /**
     * Retrieve memories by semantic similarity.
     */
    async retrieve(query) {
        const results = await this.store.search(query);
        // Update access metadata for retrieved items
        const now = Date.now();
        for (const result of results) {
            result.item.metadata.lastAccessedAt = now;
            result.item.metadata.accessCount++;
        }
        return results;
    }
    /**
     * Delete a memory by id.
     */
    forget(id) {
        const removed = this.store.remove(id);
        if (removed)
            this.saveToDisk();
        return removed;
    }
    /**
     * Delete all memories matching a topic.
     */
    forgetByTopic(topic) {
        const items = this.store.getAll().filter((m) => m.metadata.topic === topic);
        for (const item of items) {
            this.store.remove(item.id);
        }
        if (items.length > 0)
            this.saveToDisk();
        return items.length;
    }
    /**
     * Reduce importance of old memories based on age.
     * Uses exponential decay with configurable half-life.
     */
    decay() {
        const now = Date.now();
        const items = this.store.getAll();
        let decayed = 0;
        for (const item of items) {
            const ageMs = now - item.metadata.createdAt;
            const decayFactor = Math.pow(0.5, ageMs / this.decayHalfLifeMs);
            const newImportance = item.metadata.importance * decayFactor;
            if (Math.abs(newImportance - item.metadata.importance) > 0.001) {
                item.metadata.importance = newImportance;
                decayed++;
            }
        }
        if (decayed > 0)
            this.saveToDisk();
        return decayed;
    }
    /**
     * Remove memories that have decayed below a threshold.
     */
    prune(minImportance = 0.01) {
        const items = this.store.getAll();
        const toRemove = items.filter((m) => m.metadata.importance < minImportance);
        for (const item of toRemove) {
            this.store.remove(item.id);
        }
        if (toRemove.length > 0)
            this.saveToDisk();
        return toRemove.length;
    }
    /**
     * Compress multiple related memories into a single summary memory.
     * Returns the new summary memory item.
     */
    async summarize(params) {
        // Remove source memories if provided
        if (params.sourceMemoryIds) {
            for (const id of params.sourceMemoryIds) {
                this.store.remove(id);
            }
        }
        // Write the summary as a new high-importance memory
        const summary = await this.write({
            content: params.summaryContent,
            topic: params.topic,
            importance: params.importance ?? 0.8,
            source: 'system',
            tags: ['summary'],
        });
        this.saveToDisk();
        return summary;
    }
    /**
     * Get all memories (for inspection/debugging).
     */
    getAll() {
        return this.store.getAll();
    }
    /**
     * Get count of stored memories.
     */
    size() {
        return this.store.size();
    }
    evictIfNeeded() {
        const items = this.store.getAll();
        if (items.length <= this.maxMemories)
            return;
        // Evict lowest-importance, oldest memories first
        const sorted = [...items].sort((a, b) => {
            const impDiff = a.metadata.importance - b.metadata.importance;
            if (Math.abs(impDiff) > 0.01)
                return impDiff;
            return a.metadata.createdAt - b.metadata.createdAt;
        });
        const toEvict = sorted.slice(0, items.length - this.maxMemories);
        for (const item of toEvict) {
            this.store.remove(item.id);
        }
    }
    saveToDisk() {
        if (!this.storagePath)
            return;
        const dir = path_1.default.dirname(this.storagePath);
        if (!(0, fs_1.existsSync)(dir))
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        (0, fs_1.writeFileSync)(this.storagePath, this.store.serialize(), 'utf-8');
    }
    loadFromDisk() {
        if (!this.storagePath || !(0, fs_1.existsSync)(this.storagePath))
            return;
        try {
            const data = (0, fs_1.readFileSync)(this.storagePath, 'utf-8');
            this.store.deserialize(data); // async but fire-and-forget on load
        }
        catch {
            // Corrupted file — start fresh
        }
    }
}
exports.LongTermMemory = LongTermMemory;
//# sourceMappingURL=long-term-memory.js.map