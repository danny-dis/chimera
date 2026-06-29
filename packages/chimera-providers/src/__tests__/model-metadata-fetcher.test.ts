import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModelMetadataFetcher, CacheEntry } from '../model-metadata-fetcher.js';
import * as fs from 'fs';
import * as path from 'path';

describe('ModelMetadataFetcher', () => {
  const testCachePath = path.join(__dirname, '__test-cache__.json');

  beforeEach(() => {
    // Clean up test cache before each test
    if (fs.existsSync(testCachePath)) {
      fs.unlinkSync(testCachePath);
    }
  });

  afterEach(() => {
    // Clean up test cache after each test
    if (fs.existsSync(testCachePath)) {
      fs.unlinkSync(testCachePath);
    }
  });

  describe('constructor', () => {
    it('creates fetcher with default config', () => {
      const fetcher = new ModelMetadataFetcher();
      expect(fetcher).toBeDefined();
    });

    it('creates fetcher with custom config', () => {
      const fetcher = new ModelMetadataFetcher({
        cachePath: testCachePath,
        cacheTtlMs: 60_000,
        timeoutMs: 5_000,
      });
      expect(fetcher).toBeDefined();
    });
  });

  describe('loadFromCache', () => {
    it('returns null when cache does not exist', () => {
      const fetcher = new ModelMetadataFetcher({ cachePath: testCachePath });
      const result = fetcher.loadFromCache();
      expect(result).toBeNull();
    });

    it('returns null when cache is expired', () => {
      const expiredCache: CacheEntry = {
        metadata: [],
        timestamp: Date.now() - 100_000, // 100 seconds ago
        version: 1,
      };
      fs.writeFileSync(testCachePath, JSON.stringify(expiredCache), 'utf-8');

      const fetcher = new ModelMetadataFetcher({
        cachePath: testCachePath,
        cacheTtlMs: 60_000, // 60 seconds TTL
      });
      const result = fetcher.loadFromCache();
      expect(result).toBeNull();
    });

    it('returns metadata when cache is valid', () => {
      const validCache: CacheEntry = {
        metadata: [
          {
            id: 'test/model',
            name: 'Test Model',
            provider: 'test',
            contextWindow: 100_000,
            maxOutputTokens: 4_096,
            inputPerMillion: 1.0,
            outputPerMillion: 2.0,
            supportsToolCalling: true,
            supportsStructuredOutput: true,
            supportsVision: false,
            supportsReasoning: false,
            supportsParallelToolCalls: true,
            fetchedAt: Date.now(),
          },
        ],
        timestamp: Date.now(),
        version: 1,
      };
      fs.writeFileSync(testCachePath, JSON.stringify(validCache), 'utf-8');

      const fetcher = new ModelMetadataFetcher({ cachePath: testCachePath });
      const result = fetcher.loadFromCache();
      expect(result).toHaveLength(1);
      expect(result![0].id).toBe('test/model');
    });
  });

  describe('saveToCache', () => {
    it('creates cache file with correct structure', () => {
      const fetcher = new ModelMetadataFetcher({ cachePath: testCachePath });
      const metadata = [
        {
          id: 'test/model',
          name: 'Test Model',
          provider: 'test',
          contextWindow: 100_000,
          maxOutputTokens: 4_096,
          inputPerMillion: 1.0,
          outputPerMillion: 2.0,
          supportsToolCalling: true,
          supportsStructuredOutput: true,
          supportsVision: false,
          supportsReasoning: false,
          supportsParallelToolCalls: true,
          fetchedAt: Date.now(),
        },
      ];

      fetcher.saveToCache(metadata);

      expect(fs.existsSync(testCachePath)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(testCachePath, 'utf-8')) as CacheEntry;
      expect(saved.version).toBe(1);
      expect(saved.metadata).toHaveLength(1);
      expect(saved.metadata[0].id).toBe('test/model');
    });
  });

  describe('toModelEntries', () => {
    it('converts fetched metadata to ModelEntry format', () => {
      const metadata = [
        {
          id: 'anthropic/claude-sonnet-4',
          name: 'Claude Sonnet 4',
          provider: 'anthropic',
          contextWindow: 200_000,
          maxOutputTokens: 8_192,
          inputPerMillion: 3.0,
          outputPerMillion: 15.0,
          cacheReadPerMillion: 0.3,
          cacheWritePerMillion: 3.75,
          supportsToolCalling: true,
          supportsStructuredOutput: true,
          supportsVision: true,
          supportsReasoning: false,
          supportsParallelToolCalls: true,
          releaseDate: '2025-05-14',
          fetchedAt: Date.now(),
        },
      ];

      const entries = ModelMetadataFetcher.toModelEntries(metadata);
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('anthropic/claude-sonnet-4');
      expect(entries[0].contextWindow).toBe(200_000);
      expect(entries[0].pricing.inputPerMillion).toBe(3.0);
      expect(entries[0].pricing.cacheReadPerMillion).toBe(0.3);
    });
  });
});
