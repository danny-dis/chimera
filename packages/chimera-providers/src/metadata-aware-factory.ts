import { ModelProvider } from './types/provider.js';
import { ModelRegistry } from './model-registry.js';
import { FetchedModelMetadata, ModelMetadataFetcher } from './model-metadata-fetcher.js';
import { ProviderFactory } from './provider-factory.js';
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
export class MetadataAwareProviderFactory {
  private metadata: Map<string, FetchedModelMetadata> = new Map();
  private fetcher: ModelMetadataFetcher;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: MetadataAwareFactoryConfig = {}) {
    this.fetcher = new ModelMetadataFetcher({
      openrouterApiKey: config.openrouterApiKey,
      cachePath: config.cachePath,
      cacheTtlMs: config.cacheTtlMs,
    });
  }

  /**
   * Initialize the factory by loading metadata from cache or API.
   * Must be called before creating providers if you want dynamic metadata.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.loadMetadata();
    await this.initPromise;
    this.initialized = true;
  }

  /**
   * Load metadata from cache or fetch from API.
   */
  private async loadMetadata(): Promise<void> {
    try {
      const metadata = await this.fetcher.getMetadata();
      this.metadata.clear();
      for (const entry of metadata) {
        this.metadata.set(entry.id, entry);
      }
    } catch (error) {
      // Silently fail - will use hardcoded data
      console.warn('Failed to load model metadata from API:', error);
    }
  }

  /**
   * Force refresh metadata from API.
   */
  async refresh(): Promise<void> {
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
  getModelMetadata(modelId: string): FetchedModelMetadata | undefined {
    return this.metadata.get(modelId);
  }

  /**
   * Get all loaded metadata.
   */
  getAllMetadata(): FetchedModelMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Create a provider with dynamically fetched metadata injected.
   * Falls back to base factory if metadata is unavailable.
   */
  async createProvider(config: ProviderConfig): Promise<ModelProvider> {
    if (!this.initialized && config.provider !== 'mock') {
      await this.initialize();
    }

    // Get base provider from factory
    const provider = ProviderFactory.create(config);

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
  createProviderWithMetadata(
    config: ProviderConfig,
    metadata: FetchedModelMetadata,
  ): ModelProvider {
    const provider = ProviderFactory.create(config);
    return this.injectMetadata(provider, metadata);
  }

  /**
   * Normalize model ID to match OpenRouter format.
   * e.g., 'claude-sonnet-4-20250514' -> 'anthropic/claude-sonnet-4-20250514'
   */
  private normalizeModelId(provider: string, model: string): string {
    if (model.includes('/')) {
      return model;
    }
    return `${provider}/${model}`;
  }

  /**
   * Inject metadata into a provider using the options override mechanism.
   */
  private injectMetadata(provider: ModelProvider, metadata: FetchedModelMetadata): ModelProvider {
    // The providers support metadata injection via the options parameter
    // We need to recreate the provider with the metadata injected
    // For now, we'll store the metadata and let consumers access it
    // A full implementation would require provider-specific injection
    
    // Store metadata on the provider for consumers to access
    const enhancedProvider = provider as ModelProvider & {
      _dynamicMetadata?: FetchedModelMetadata;
    };
    enhancedProvider._dynamicMetadata = metadata;
    
    return enhancedProvider;
  }

  /**
   * Get context window for a model, preferring dynamic data over hardcoded.
   */
  getContextWindow(modelId: string, hardcodedFallback: number): number {
    const metadata = this.metadata.get(modelId);
    return metadata?.contextWindow ?? hardcodedFallback;
  }

  /**
   * Get max output tokens for a model, preferring dynamic data over hardcoded.
   */
  getMaxOutputTokens(modelId: string, hardcodedFallback: number): number {
    const metadata = this.metadata.get(modelId);
    return metadata?.maxOutputTokens ?? hardcodedFallback;
  }

  /**
   * Get pricing for a model, preferring dynamic data over hardcoded.
   */
  getPricing(modelId: string): {
    inputPerMillion: number;
    outputPerMillion: number;
    cacheReadPerMillion?: number;
    cacheWritePerMillion?: number;
  } | undefined {
    const metadata = this.metadata.get(modelId);
    if (!metadata) return undefined;

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
  mergeIntoRegistry(registry: ModelRegistry): { added: number; updated: number } {
    const entries = ModelMetadataFetcher.toModelEntries(Array.from(this.metadata.values()));
    return registry.mergeFetchedMetadata(entries);
  }

  /**
   * Check if metadata is loaded and fresh.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the timestamp of when metadata was last fetched.
   */
  getLastFetchTime(): number | null {
    const entries = Array.from(this.metadata.values());
    if (entries.length === 0) return null;
    return Math.max(...entries.map((e) => e.fetchedAt));
  }
}

/**
 * Create a metadata-aware provider factory with default configuration.
 */
export function createMetadataAwareFactory(
  config?: MetadataAwareFactoryConfig,
): MetadataAwareProviderFactory {
  return new MetadataAwareProviderFactory(config);
}

/**
 * Quick helper to get a provider with dynamic metadata.
 * This handles initialization automatically.
 */
export async function createProviderWithDynamicMetadata(
  providerConfig: ProviderConfig,
  factoryConfig?: MetadataAwareFactoryConfig,
): Promise<ModelProvider> {
  const factory = createMetadataAwareFactory(factoryConfig);
  return factory.createProvider(providerConfig);
}
