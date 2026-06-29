import { ModelProvider } from './types/provider.js';
import { ModelRegistry } from './model-registry.js';
import { FetchedModelMetadata } from './model-metadata-fetcher.js';
import { ProviderConfig } from './model-adapter.js';
/**
 * Configuration for the MetadataAwareProviderFactory.
 */
export interface MetadataAwareFactoryConfig {
    /** OpenRouter API key for fetching metadata (optional) */
    openrouterApiKey?: string;
    /** Cache file path (defaults to ~/.chimera/model-metadata-cache.json) */
    cachePath?: string;
    /** Cache TTL in milliseconds (defaults to 24 hours) */
    cacheTtlMs?: number;
    /** Whether to auto-refresh metadata on initialization (defaults to false) */
    autoRefresh?: boolean;
}
/**
 * A provider factory that dynamically fetches and injects model metadata
 * (context windows, pricing, capabilities) from provider APIs.
 *
 * This factory wraps the base ProviderFactory and enhances it with:
 * - Dynamic context window sizes from OpenRouter API
 * - Updated pricing from provider APIs
 * - Local caching to minimize API calls
 * - Fallback to hardcoded data when API is unavailable
 */
export declare class MetadataAwareProviderFactory {
    private metadata;
    private fetcher;
    private initialized;
    private initPromise;
    constructor(config?: MetadataAwareFactoryConfig);
    /**
     * Initialize the factory by loading metadata from cache or API.
     * Must be called before creating providers if you want dynamic metadata.
     */
    initialize(): Promise<void>;
    /**
     * Load metadata from cache or fetch from API.
     */
    private loadMetadata;
    /**
     * Force refresh metadata from API.
     */
    refresh(): Promise<void>;
    /**
     * Get metadata for a specific model.
     */
    getModelMetadata(modelId: string): FetchedModelMetadata | undefined;
    /**
     * Get all loaded metadata.
     */
    getAllMetadata(): FetchedModelMetadata[];
    /**
     * Create a provider with dynamically fetched metadata injected.
     * Falls back to base factory if metadata is unavailable.
     */
    createProvider(config: ProviderConfig): Promise<ModelProvider>;
    /**
     * Create a provider with explicit metadata override.
     */
    createProviderWithMetadata(config: ProviderConfig, metadata: FetchedModelMetadata): ModelProvider;
    /**
     * Normalize model ID to match OpenRouter format.
     * e.g., 'claude-sonnet-4-20250514' -> 'anthropic/claude-sonnet-4-20250514'
     */
    private normalizeModelId;
    /**
     * Inject metadata into a provider using the options override mechanism.
     */
    private injectMetadata;
    /**
     * Get context window for a model, preferring dynamic data over hardcoded.
     */
    getContextWindow(modelId: string, hardcodedFallback: number): number;
    /**
     * Get max output tokens for a model, preferring dynamic data over hardcoded.
     */
    getMaxOutputTokens(modelId: string, hardcodedFallback: number): number;
    /**
     * Get pricing for a model, preferring dynamic data over hardcoded.
     */
    getPricing(modelId: string): {
        inputPerMillion: number;
        outputPerMillion: number;
        cacheReadPerMillion?: number;
        cacheWritePerMillion?: number;
    } | undefined;
    /**
     * Merge fetched metadata into a ModelRegistry.
     * This updates the registry with dynamic context windows and pricing.
     */
    mergeIntoRegistry(registry: ModelRegistry): {
        added: number;
        updated: number;
    };
    /**
     * Check if metadata is loaded and fresh.
     */
    isInitialized(): boolean;
    /**
     * Get the timestamp of when metadata was last fetched.
     */
    getLastFetchTime(): number | null;
}
/**
 * Create a metadata-aware provider factory with default configuration.
 */
export declare function createMetadataAwareFactory(config?: MetadataAwareFactoryConfig): MetadataAwareProviderFactory;
/**
 * Quick helper to get a provider with dynamic metadata.
 * This handles initialization automatically.
 */
export declare function createProviderWithDynamicMetadata(providerConfig: ProviderConfig, factoryConfig?: MetadataAwareFactoryConfig): Promise<ModelProvider>;
//# sourceMappingURL=metadata-aware-factory.d.ts.map