"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolContextRelay = void 0;
const DEFAULT_CONFIG = {
    defaultTtlMs: 24 * 60 * 60 * 1000,
    maxStoreSize: 1000,
    boxThreshold: 2000,
};
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const REF_PATTERN = /internal:\/\/relay-[\w-]+/g;
let globalCounter = 0;
function generateId() {
    return `relay-${Date.now()}-${globalCounter++}`;
}
function estimateTokens(data) {
    return Math.ceil(data.length / 4);
}
class ToolContextRelay {
    store = new Map();
    cleanupInterval = null;
    config;
    constructor(params) {
        this.config = {
            defaultTtlMs: params?.defaultTtlMs ?? DEFAULT_CONFIG.defaultTtlMs,
            maxStoreSize: params?.maxStoreSize ?? DEFAULT_CONFIG.maxStoreSize,
            boxThreshold: params?.boxThreshold ?? DEFAULT_CONFIG.boxThreshold,
        };
        this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    }
    box(data, options) {
        const id = generateId();
        const ttlMs = options?.ttlMs ?? this.config.defaultTtlMs;
        const payload = {
            id,
            data,
            tokens: estimateTokens(data),
            createdAt: Date.now(),
            ttlMs,
            metadata: options?.metadata,
        };
        this.evictOldestIfNeeded();
        this.store.set(id, payload);
        return { ref: `internal://${id}` };
    }
    unbox(ref) {
        const id = this.extractIdFromRef(ref.ref);
        if (!id)
            return null;
        const payload = this.store.get(id);
        if (!payload)
            return null;
        if (this.isExpired(payload)) {
            this.store.delete(id);
            return null;
        }
        return payload.data;
    }
    readSlice(ref, start, end) {
        const full = this.unbox(ref);
        if (full === null)
            return null;
        const sliced = full.slice(start, end);
        return sliced;
    }
    isRelayReference(value) {
        return /^internal:\/\/relay-[\w-]+$/.test(value);
    }
    extractReferences(text) {
        const refs = [];
        let match;
        REF_PATTERN.lastIndex = 0;
        while ((match = REF_PATTERN.exec(text)) !== null) {
            const refStr = match[0];
            if (this.store.has(this.extractId(refStr))) {
                refs.push({ ref: refStr });
            }
        }
        return refs;
    }
    resolveReferences(text) {
        return text.replace(REF_PATTERN, (match) => {
            const id = this.extractId(match);
            const payload = this.store.get(id);
            if (!payload || this.isExpired(payload))
                return match;
            return payload.data;
        });
    }
    cleanup() {
        let removed = 0;
        const now = Date.now();
        for (const [id, payload] of this.store) {
            if (now - payload.createdAt >= payload.ttlMs) {
                this.store.delete(id);
                removed++;
            }
        }
        return removed;
    }
    getStats() {
        let totalTokens = 0;
        let oldestCreatedAt = Infinity;
        for (const payload of this.store.values()) {
            totalTokens += payload.tokens;
            if (payload.createdAt < oldestCreatedAt) {
                oldestCreatedAt = payload.createdAt;
            }
        }
        return {
            totalPayloads: this.store.size,
            totalTokens,
            oldestAge: this.store.size > 0 ? Date.now() - oldestCreatedAt : null,
        };
    }
    destroy() {
        if (this.cleanupInterval !== null) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.store.clear();
    }
    extractIdFromRef(ref) {
        if (!ref.startsWith('internal://'))
            return null;
        return ref.slice('internal://'.length);
    }
    extractId(ref) {
        return ref.slice('internal://'.length);
    }
    isExpired(payload) {
        return Date.now() - payload.createdAt >= payload.ttlMs;
    }
    evictOldestIfNeeded() {
        while (this.store.size >= this.config.maxStoreSize) {
            let oldestId = null;
            let oldestTime = Infinity;
            for (const [id, payload] of this.store) {
                if (payload.createdAt < oldestTime) {
                    oldestTime = payload.createdAt;
                    oldestId = id;
                }
            }
            if (oldestId) {
                this.store.delete(oldestId);
            }
            else {
                break;
            }
        }
    }
}
exports.ToolContextRelay = ToolContextRelay;
//# sourceMappingURL=tool-context-relay.js.map