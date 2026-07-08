/**
 * Web search provider manager for chimera.
 * Handles provider registration, fallback chain, and caching.
 */
import type { WebSearchProvider, SearchOptions, SearchResponse, ProviderRegistration, ProviderPriority } from './types.js';
export declare class WebSearchProviderManager {
    private providers;
    private cache;
    private cacheTtl;
    constructor();
    /**
     * Register a new search provider
     */
    registerProvider(provider: WebSearchProvider, priority?: ProviderPriority, enabled?: boolean): void;
    /**
     * Enable or disable a provider
     */
    setProviderEnabled(name: string, enabled: boolean): void;
    /**
     * Get all registered providers
     */
    getProviders(): ProviderRegistration[];
    /**
     * Get available providers (enabled and reachable)
     */
    getAvailableProviders(): Promise<WebSearchProvider[]>;
    /**
     * Perform a web search with automatic provider fallback
     */
    search(query: string, options?: SearchOptions): Promise<SearchResponse>;
    /**
     * Clear the search cache
     */
    clearCache(): void;
    /**
     * Get cache statistics
     */
    getCacheStats(): {
        size: number;
        ttl: number;
    };
    private getCacheKey;
}
//# sourceMappingURL=provider-manager.d.ts.map