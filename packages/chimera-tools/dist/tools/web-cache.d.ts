export declare class LruTtlCache<V> {
    private readonly maxEntries;
    private readonly ttlMs;
    private store;
    constructor(maxEntries: number, ttlMs: number);
    get(key: string): V | undefined;
    set(key: string, value: V): void;
    clear(): void;
    get size(): number;
}
//# sourceMappingURL=web-cache.d.ts.map