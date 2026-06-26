import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DuckDuckGoProvider } from '../tools/web-search-providers/duckduckgo.js';
import { SearxngProvider } from '../tools/web-search-providers/searxng.js';
import { BraveSearchProvider } from '../tools/web-search-providers/brave.js';
import { WebSearchProviderManager } from '../tools/web-search-providers/provider-manager.js';

describe('Web Search Providers', () => {
  describe('DuckDuckGoProvider', () => {
    let provider: DuckDuckGoProvider;

    beforeEach(() => {
      provider = new DuckDuckGoProvider();
    });

    it('should have correct name', () => {
      expect(provider.name).toBe('duckduckgo');
    });

    it('should return correct config', () => {
      const config = provider.getConfig();
      expect(config.name).toBe('duckduckgo');
      expect(config.requiresApiKey).toBe(false);
      expect(config.rateLimit).toBe(30);
    });

    it('should not require API key', () => {
      const config = provider.getConfig();
      expect(config.requiresApiKey).toBe(false);
    });
  });

  describe('SearxngProvider', () => {
    let provider: SearxngProvider;

    beforeEach(() => {
      provider = new SearxngProvider({ baseUrl: 'http://localhost:8888' });
    });

    it('should have correct name', () => {
      expect(provider.name).toBe('searxng');
    });

    it('should return correct config', () => {
      const config = provider.getConfig();
      expect(config.name).toBe('searxng');
      expect(config.requiresApiKey).toBe(false);
      expect(config.baseUrl).toBe('http://localhost:8888');
    });

    it('should not require API key', () => {
      const config = provider.getConfig();
      expect(config.requiresApiKey).toBe(false);
    });
  });

  describe('BraveSearchProvider', () => {
    let provider: BraveSearchProvider;

    beforeEach(() => {
      provider = new BraveSearchProvider('test-api-key');
    });

    it('should have correct name', () => {
      expect(provider.name).toBe('brave');
    });

    it('should return correct config', () => {
      const config = provider.getConfig();
      expect(config.name).toBe('brave');
      expect(config.requiresApiKey).toBe(true);
      expect(config.apiKey).toBe('***'); // API key should be masked
    });

    it('should require API key', () => {
      const config = provider.getConfig();
      expect(config.requiresApiKey).toBe(true);
    });

    it('should throw error when searching without API key', async () => {
      const providerWithoutKey = new BraveSearchProvider('');
      await expect(providerWithoutKey.search('test')).rejects.toThrow('Brave Search API key is required');
    });
  });

  describe('WebSearchProviderManager', () => {
    let manager: WebSearchProviderManager;

    beforeEach(() => {
      manager = new WebSearchProviderManager();
    });

    it('should register providers', () => {
      const providers = manager.getProviders();
      expect(providers.length).toBe(3); // DuckDuckGo, SearXNG, Brave
    });

    it('should enable/disable providers', () => {
      manager.setProviderEnabled('duckduckgo', false);
      const providers = manager.getProviders();
      const duckduckgo = providers.find(p => p.provider.name === 'duckduckgo');
      expect(duckduckgo?.enabled).toBe(false);
    });

    it('should clear cache', () => {
      manager.clearCache();
      const stats = manager.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should return cache stats', () => {
      const stats = manager.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('ttl');
      expect(stats.ttl).toBe(5 * 60 * 1000); // 5 minutes
    });
  });
});
