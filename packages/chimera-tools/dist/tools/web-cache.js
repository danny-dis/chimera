"use strict";
// Tiny in-memory LRU cache with TTL eviction.
// Used to deduplicate identical websearch calls within a 5-minute window.
Object.defineProperty(exports, "__esModule", { value: true });
exports.LruTtlCache = void 0;
class LruTtlCache {
    maxEntries;
    ttlMs;
    store = new Map();
    constructor(maxEntries, ttlMs) {
        this.maxEntries = maxEntries;
        this.ttlMs = ttlMs;
    }
    get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        // LRU touch: re-insert to move to most-recently-used end.
        this.store.delete(key);
        this.store.set(key, entry);
        return entry.value;
    }
    set(key, value) {
        if (this.store.has(key))
            this.store.delete(key);
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        while (this.store.size > this.maxEntries) {
            const oldest = this.store.keys().next().value;
            if (oldest === undefined)
                break;
            this.store.delete(oldest);
        }
    }
    clear() {
        this.store.clear();
    }
    get size() {
        return this.store.size;
    }
}
exports.LruTtlCache = LruTtlCache;
//# sourceMappingURL=web-cache.js.map