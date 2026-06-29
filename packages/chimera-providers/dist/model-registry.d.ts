import { z } from 'zod';
export declare const ModelEntrySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    provider: z.ZodString;
    contextWindow: z.ZodNumber;
    maxOutputTokens: z.ZodNumber;
    pricing: z.ZodObject<{
        inputPerMillion: z.ZodNumber;
        outputPerMillion: z.ZodNumber;
        cacheReadPerMillion: z.ZodOptional<z.ZodNumber>;
        cacheWritePerMillion: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        inputPerMillion: number;
        outputPerMillion: number;
        cacheReadPerMillion?: number | undefined;
        cacheWritePerMillion?: number | undefined;
    }, {
        inputPerMillion: number;
        outputPerMillion: number;
        cacheReadPerMillion?: number | undefined;
        cacheWritePerMillion?: number | undefined;
    }>;
    capabilities: z.ZodObject<{
        toolCalling: z.ZodBoolean;
        structuredOutput: z.ZodBoolean;
        vision: z.ZodBoolean;
        reasoning: z.ZodBoolean;
        parallelToolCalls: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        reasoning: boolean;
        toolCalling: boolean;
        structuredOutput: boolean;
        vision: boolean;
        parallelToolCalls: boolean;
    }, {
        reasoning: boolean;
        toolCalling: boolean;
        structuredOutput: boolean;
        vision: boolean;
        parallelToolCalls: boolean;
    }>;
    degradationThreshold: z.ZodNumber;
    tier: z.ZodEnum<["cheap", "mid", "frontier", "reasoning"]>;
    releaseDate: z.ZodOptional<z.ZodString>;
    deprecated: z.ZodOptional<z.ZodBoolean>;
    replacement: z.ZodOptional<z.ZodString>;
    /** Timestamp when this metadata was fetched from API (0 = hardcoded) */
    fetchedAt: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    pricing: {
        inputPerMillion: number;
        outputPerMillion: number;
        cacheReadPerMillion?: number | undefined;
        cacheWritePerMillion?: number | undefined;
    };
    provider: string;
    contextWindow: number;
    maxOutputTokens: number;
    capabilities: {
        reasoning: boolean;
        toolCalling: boolean;
        structuredOutput: boolean;
        vision: boolean;
        parallelToolCalls: boolean;
    };
    degradationThreshold: number;
    tier: "reasoning" | "cheap" | "mid" | "frontier";
    releaseDate?: string | undefined;
    deprecated?: boolean | undefined;
    replacement?: string | undefined;
    fetchedAt?: number | undefined;
}, {
    id: string;
    name: string;
    pricing: {
        inputPerMillion: number;
        outputPerMillion: number;
        cacheReadPerMillion?: number | undefined;
        cacheWritePerMillion?: number | undefined;
    };
    provider: string;
    contextWindow: number;
    maxOutputTokens: number;
    capabilities: {
        reasoning: boolean;
        toolCalling: boolean;
        structuredOutput: boolean;
        vision: boolean;
        parallelToolCalls: boolean;
    };
    degradationThreshold: number;
    tier: "reasoning" | "cheap" | "mid" | "frontier";
    releaseDate?: string | undefined;
    deprecated?: boolean | undefined;
    replacement?: string | undefined;
    fetchedAt?: number | undefined;
}>;
export type ModelEntry = z.infer<typeof ModelEntrySchema>;
export declare class ModelRegistry {
    private models;
    private hardcodedIds;
    private cacheLoaded;
    private cacheTimestamp;
    private skipCacheLoading;
    constructor(initialModels?: ModelEntry[], options?: {
        skipCacheLoading?: boolean;
    });
    /**
     * Get the default cache file path (~/.chimera/model-metadata-cache.json)
     */
    private getCachePath;
    /**
     * Synchronously load and merge cache from disk.
     * Called automatically in constructor. Silently fails if cache is missing/expired.
     */
    private loadCacheSync;
    /**
     * Convert fetched metadata format to ModelEntry format.
     */
    private toModelEntries;
    /**
     * Infer model tier from pricing and capabilities.
     */
    private inferTier;
    get(id: string): ModelEntry | undefined;
    getByProvider(provider: string): ModelEntry[];
    getByTier(tier: string): ModelEntry[];
    search(query: string): ModelEntry[];
    getAll(): ModelEntry[];
    register(entry: ModelEntry): void;
    isRegistered(id: string): boolean;
    /**
     * Merge fetched metadata into the registry.
     * - For existing models: updates contextWindow, maxOutputTokens, and pricing if the fetched data is newer
     * - For new models: adds them to the registry
     * - Preserves hardcoded models' tier and degradationThreshold unless explicitly overridden
     */
    mergeFetchedMetadata(fetchedEntries: ModelEntry[]): {
        added: number;
        updated: number;
    };
    /**
     * Get all model IDs that were loaded from hardcoded data.
     */
    getHardcodedIds(): string[];
    /**
     * Check if a model was loaded from hardcoded data.
     */
    isHardcoded(id: string): boolean;
    /**
     * Check if cache was loaded successfully during construction.
     */
    isCacheLoaded(): boolean;
    /**
     * Get the timestamp of when the cache was last updated.
     */
    getCacheTimestamp(): number;
    /**
     * Get the total number of models in the registry (hardcoded + cached).
     */
    getModelCount(): number;
    /**
     * Get the number of hardcoded models.
     */
    getHardcodedCount(): number;
    /**
     * Get the number of models added from cache (non-hardcoded).
     */
    getCachedCount(): number;
    /**
     * Async refresh of model metadata from OpenRouter API.
     * Fetches fresh data, updates cache file, and merges into registry.
     *
     * @param config - Optional configuration for the fetcher
     * @returns Object with counts of added and updated models
     *
     * @example
     * ```typescript
     * const registry = new ModelRegistry();
     * const result = await registry.refreshFromAPI();
     * console.log(`Added ${result.added} new models, updated ${result.updated} existing`);
     * ```
     */
    refreshFromAPI(config?: {
        openrouterApiKey?: string;
    }): Promise<{
        added: number;
        updated: number;
    }>;
    /**
     * Load cache from disk and merge into registry.
     * Useful for reloading after cache has been updated externally.
     *
     * @returns true if cache was loaded, false otherwise
     */
    reloadCache(): boolean;
}
//# sourceMappingURL=model-registry.d.ts.map