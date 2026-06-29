"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetadataAwareProviderFactory = void 0;
exports.createMetadataAwareFactory = createMetadataAwareFactory;
exports.createProviderWithDynamicMetadata = createProviderWithDynamicMetadata;
const model_metadata_fetcher_js_1 = require("./model-metadata-fetcher.js");
const provider_factory_js_1 = require("./provider-factory.js");
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
class MetadataAwareProviderFactory {
    metadata = new Map();
    fetcher;
    initialized = false;
    initPromise = null;
    constructor(config = {}) {
        this.fetcher = new model_metadata_fetcher_js_1.ModelMetadataFetcher({
            openrouterApiKey: config.openrouterApiKey,
            cachePath: config.cachePath,
            cacheTtlMs: config.cacheTtlMs,
        });
    }
    /**
     * Initialize the factory by loading metadata from cache or API.
     * Must be called before creating providers if you want dynamic metadata.
     */
    async initialize() {
        if (this.initialized)
            return;
        if (this.initPromise)
            return this.initPromise;
        this.initPromise = this.loadMetadata();
        await this.initPromise;
        this.initialized = true;
    }
    /**
     * Load metadata from cache or fetch from API.
     */
    async loadMetadata() {
        try {
            const metadata = await this.fetcher.getMetadata();
            this.metadata.clear();
            for (const entry of metadata) {
                this.metadata.set(entry.id, entry);
            }
        }
        catch (error) {
            // Silently fail - will use hardcoded data
            console.warn('Failed to load model metadata from API:', error);
        }
    }
    /**
     * Force refresh metadata from API.
     */
    async refresh() {
        const metadata = await this.fetcher.refreshMetadata();
        this.metadata.clear();
        for (const entry of metadata) {
            this.metadata.set(entry.id, entry);
        }
        this.initialized = true;
    }
    /**
     * Get metadata for a specific model.
     */
    getModelMetadata(modelId) {
        return this.metadata.get(modelId);
    }
    /**
     * Get all loaded metadata.
     */
    getAllMetadata() {
        return Array.from(this.metadata.values());
    }
    /**
     * Create a provider with dynamically fetched metadata injected.
     * Falls back to base factory if metadata is unavailable.
     */
    async createProvider(config) {
        if (!this.initialized && config.provider !== 'mock') {
            await this.initialize();
        }
        // Get base provider from factory
        const provider = provider_factory_js_1.ProviderFactory.create(config);
        // Try to inject metadata if available
        const modelId = this.normalizeModelId(config.provider, config.model);
        const metadata = this.metadata.get(modelId);
        if (metadata) {
            return this.injectMetadata(provider, metadata);
        }
        return provider;
    }
    /**
     * Create a provider with explicit metadata override.
     */
    createProviderWithMetadata(config, metadata) {
        const provider = provider_factory_js_1.ProviderFactory.create(config);
        return this.injectMetadata(provider, metadata);
    }
    /**
     * Normalize model ID to match OpenRouter format.
     * e.g., 'claude-sonnet-4-20250514' -> 'anthropic/claude-sonnet-4-20250514'
     */
    normalizeModelId(provider, model) {
        if (model.includes('/')) {
            return model;
        }
        return `${provider}/${model}`;
    }
    /**
     * Inject metadata into a provider using the options override mechanism.
     */
    injectMetadata(provider, metadata) {
        // The providers support metadata injection via the options parameter
        // We need to recreate the provider with the metadata injected
        // For now, we'll store the metadata and let consumers access it
        // A full implementation would require provider-specific injection
        // Store metadata on the provider for consumers to access
        const enhancedProvider = provider;
        enhancedProvider._dynamicMetadata = metadata;
        return enhancedProvider;
    }
    /**
     * Get context window for a model, preferring dynamic data over hardcoded.
     */
    getContextWindow(modelId, hardcodedFallback) {
        const metadata = this.metadata.get(modelId);
        return metadata?.contextWindow ?? hardcodedFallback;
    }
    /**
     * Get max output tokens for a model, preferring dynamic data over hardcoded.
     */
    getMaxOutputTokens(modelId, hardcodedFallback) {
        const metadata = this.metadata.get(modelId);
        return metadata?.maxOutputTokens ?? hardcodedFallback;
    }
    /**
     * Get pricing for a model, preferring dynamic data over hardcoded.
     */
    getPricing(modelId) {
        const metadata = this.metadata.get(modelId);
        if (!metadata)
            return undefined;
        return {
            inputPerMillion: metadata.inputPerMillion,
            outputPerMillion: metadata.outputPerMillion,
            cacheReadPerMillion: metadata.cacheReadPerMillion,
            cacheWritePerMillion: metadata.cacheWritePerMillion,
        };
    }
    /**
     * Merge fetched metadata into a ModelRegistry.
     * This updates the registry with dynamic context windows and pricing.
     */
    mergeIntoRegistry(registry) {
        const entries = model_metadata_fetcher_js_1.ModelMetadataFetcher.toModelEntries(Array.from(this.metadata.values()));
        return registry.mergeFetchedMetadata(entries);
    }
    /**
     * Check if metadata is loaded and fresh.
     */
    isInitialized() {
        return this.initialized;
    }
    /**
     * Get the timestamp of when metadata was last fetched.
     */
    getLastFetchTime() {
        const entries = Array.from(this.metadata.values());
        if (entries.length === 0)
            return null;
        return Math.max(...entries.map((e) => e.fetchedAt));
    }
}
exports.MetadataAwareProviderFactory = MetadataAwareProviderFactory;
/**
 * Create a metadata-aware provider factory with default configuration.
 */
function createMetadataAwareFactory(config) {
    return new MetadataAwareProviderFactory(config);
}
/**
 * Quick helper to get a provider with dynamic metadata.
 * This handles initialization automatically.
 */
async function createProviderWithDynamicMetadata(providerConfig, factoryConfig) {
    const factory = createMetadataAwareFactory(factoryConfig);
    return factory.createProvider(providerConfig);
}
//# sourceMappingURL=metadata-aware-factory.js.map