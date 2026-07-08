"use strict";
/**
 * Web search provider manager for chimera.
 * Handles provider registration, fallback chain, and caching.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSearchProviderManager = void 0;
const duckduckgo_js_1 = require("./duckduckgo.js");
const searxng_js_1 = require("./searxng.js");
const brave_js_1 = require("./brave.js");
class WebSearchProviderManager {
    providers = new Map();
    cache = new Map();
    cacheTtl = 5 * 60 * 1000; // 5 minutes cache TTL
    constructor() {
        // Register default providers
        this.registerProvider(new duckduckgo_js_1.DuckDuckGoProvider(), 'high', true);
        this.registerProvider(new searxng_js_1.SearxngProvider(), 'medium', true);
        this.registerProvider(new brave_js_1.BraveSearchProvider(), 'low', true);
    }
    /**
     * Register a new search provider
     */
    registerProvider(provider, priority = 'medium', enabled = true) {
        this.providers.set(provider.name, {
            provider,
            priority,
            enabled,
        });
    }
    /**
     * Enable or disable a provider
     */
    setProviderEnabled(name, enabled) {
        const registration = this.providers.get(name);
        if (registration) {
            registration.enabled = enabled;
        }
    }
    /**
     * Get all registered providers
     */
    getProviders() {
        return Array.from(this.providers.values());
    }
    /**
     * Get available providers (enabled and reachable)
     */
    async getAvailableProviders() {
        const available = [];
        // Sort by priority
        const sortedProviders = Array.from(this.providers.values())
            .filter(p => p.enabled)
            .sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
        for (const registration of sortedProviders) {
            try {
                const isAvailable = await registration.provider.isAvailable();
                if (isAvailable) {
                    available.push(registration.provider);
                }
            }
            catch {
                // Provider not available, skip
            }
        }
        return available;
    }
    /**
     * Perform a web search with automatic provider fallback
     */
    async search(query, options = {}) {
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
        let lastError = null;
        for (const provider of providers) {
            try {
                const response = await provider.search(query, options);
                // Cache successful response
                this.cache.set(cacheKey, {
                    response,
                    timestamp: Date.now(),
                });
                return response;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                // Continue to next provider
            }
        }
        throw new Error(`All search providers failed. Last error: ${lastError?.message || 'Unknown error'}`);
    }
    /**
     * Clear the search cache
     */
    clearCache() {
        this.cache.clear();
    }
    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            ttl: this.cacheTtl,
        };
    }
    getCacheKey(query, options) {
        return JSON.stringify({ query, ...options });
    }
}
exports.WebSearchProviderManager = WebSearchProviderManager;
//# sourceMappingURL=provider-manager.js.map