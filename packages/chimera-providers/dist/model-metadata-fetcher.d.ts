import { ModelEntry } from './model-registry.js';
export interface FetchedModelMetadata {
    /** Model ID in format 'provider/model-name' */
    id: string;
    /** Human-readable name */
    name: string;
    /** Provider name */
    provider: string;
    /** Context window size in tokens */
    contextWindow: number;
    /** Maximum output tokens */
    maxOutputTokens: number;
    /** Input cost per million tokens */
    inputPerMillion: number;
    /** Output cost per million tokens */
    outputPerMillion: number;
    /** Cache read cost per million tokens (if available) */
    cacheReadPerMillion?: number;
    /** Cache write cost per million tokens (if available) */
    cacheWritePerMillion?: number;
    /** Whether the model supports tool calling */
    supportsToolCalling: boolean;
    /** Whether the model supports structured output */
    supportsStructuredOutput: boolean;
    /** Whether the model supports vision */
    supportsVision: boolean;
    /** Whether the model supports reasoning */
    supportsReasoning: boolean;
    /** Whether the model supports parallel tool calls */
    supportsParallelToolCalls: boolean;
    /** ISO date string of when the model was released */
    releaseDate?: string;
    /** Knowledge cutoff date */
    knowledgeCutoff?: string;
    /** Timestamp when this metadata was fetched */
    fetchedAt: number;
}
export interface CacheEntry {
    /** The fetched metadata */
    metadata: FetchedModelMetadata[];
    /** Timestamp when the cache was created */
    timestamp: number;
    /** Version of the cache format */
    version: number;
}
export interface FetcherConfig {
    /** OpenRouter API key (optional - anonymous access available with rate limits) */
    openrouterApiKey?: string;
    /** Cache file path (defaults to ~/.chimera/model-metadata-cache.json) */
    cachePath?: string;
    /** Cache TTL in milliseconds (defaults to 24 hours) */
    cacheTtlMs?: number;
    /** Request timeout in milliseconds (defaults to 10 seconds) */
    timeoutMs?: number;
}
export declare class ModelMetadataFetcher {
    private config;
    constructor(config?: FetcherConfig);
    /**
     * Fetch model metadata from OpenRouter API.
     * Returns an array of FetchedModelMetadata objects.
     */
    fetchFromOpenRouter(): Promise<FetchedModelMetadata[]>;
    /**
     * Transform an OpenRouter model into our metadata format.
     */
    private transformModel;
    /**
     * Load metadata from local cache if valid.
     * Returns null if cache is missing, expired, or invalid.
     */
    loadFromCache(): FetchedModelMetadata[] | null;
    /**
     * Save metadata to local cache.
     */
    saveToCache(metadata: FetchedModelMetadata[]): void;
    /**
     * Get model metadata, using cache if valid or fetching fresh data.
     * This is the main method to use for most cases.
     */
    getMetadata(): Promise<FetchedModelMetadata[]>;
    /**
     * Force refresh metadata from API, ignoring cache.
     */
    refreshMetadata(): Promise<FetchedModelMetadata[]>;
    /**
     * Convert fetched metadata to ModelEntry format for use with ModelRegistry.
     */
    static toModelEntries(metadata: FetchedModelMetadata[]): ModelEntry[];
}
/**
 * Quick helper to fetch and cache model metadata.
 */
export declare function fetchAndCacheModelMetadata(config?: FetcherConfig): Promise<FetchedModelMetadata[]>;
/**
 * Quick helper to get ModelEntry objects from cache or API.
 */
export declare function getModelEntriesFromAPI(config?: FetcherConfig): Promise<ModelEntry[]>;
//# sourceMappingURL=model-metadata-fetcher.d.ts.map