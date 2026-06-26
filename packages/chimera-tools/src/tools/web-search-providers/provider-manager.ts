/**
 * Web search provider manager for chimera.
 * Handles provider registration, fallback chain, and caching.
 */

import type {
  WebSearchProvider,
  SearchOptions,
  SearchResponse,
  ProviderRegistration,
  ProviderPriority,
} from './types.js';
import { DuckDuckGoProvider } from './duckduckgo.js';
import { SearxngProvider } from './searxng.js';
import { BraveSearchProvider } from './brave.js';

export class WebSearchProviderManager {
  private providers: Map<string, ProviderRegistration> = new Map();
  private cache: Map<string, { response: SearchResponse; timestamp: number }> = new Map();
  private cacheTtl = 5 * 60 * 1000; // 5 minutes cache TTL

  constructor() {
    // Register default providers
    this.registerProvider(new DuckDuckGoProvider(), 'high', true);
    this.registerProvider(new SearxngProvider(), 'medium', true);
    this.registerProvider(new BraveSearchProvider(), 'low', true);
  }

  /**
   * Register a new search provider
   */
  registerProvider(
    provider: WebSearchProvider,
    priority: ProviderPriority = 'medium',
    enabled: boolean = true
  ): void {
    this.providers.set(provider.name, {
      provider,
      priority,
      enabled,
    });
  }

  /**
   * Enable or disable a provider
   */
  setProviderEnabled(name: string, enabled: boolean): void {
    const registration = this.providers.get(name);
    if (registration) {
      registration.enabled = enabled;
    }
  }

  /**
   * Get all registered providers
   */
  getProviders(): ProviderRegistration[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get available providers (enabled and reachable)
   */
  async getAvailableProviders(): Promise<WebSearchProvider[]> {
    const available: WebSearchProvider[] = [];

    // Sort by priority
    const sortedProviders = Array.from(this.providers.values())
      .filter(p => p.enabled)
      .sort((a, b) => {
        const priorityOrder: Record<ProviderPriority, number> = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

    for (const registration of sortedProviders) {
      try {
        const isAvailable = await registration.provider.isAvailable();
        if (isAvailable) {
          available.push(registration.provider);
        }
      } catch {
        // Provider not available, skip
      }
    }

    return available;
  }

  /**
   * Perform a web search with automatic provider fallback
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    // Check cache first
    const cacheKey = this.getCacheKey(query, options);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      return {
        ...cached.response,
        provider: `${cached.response.provider} (cached)`,
      };
    }

    // Get available providers
    const providers = await this.getAvailableProviders();
    if (providers.length === 0) {
      throw new Error('No search providers available. Check your network connection.');
    }

    // Try each provider in order
    let lastError: Error | null = null;
    for (const provider of providers) {
      try {
        const response = await provider.search(query, options);
        
        // Cache successful response
        this.cache.set(cacheKey, {
          response,
          timestamp: Date.now(),
        });

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        // Continue to next provider
      }
    }

    throw new Error(
      `All search providers failed. Last error: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Clear the search cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; ttl: number } {
    return {
      size: this.cache.size,
      ttl: this.cacheTtl,
    };
  }

  private getCacheKey(query: string, options: SearchOptions): string {
    return JSON.stringify({ query, ...options });
  }
}
