/**
 * SearXNG search provider for chimera.
 * Free, self-hosted metasearch engine. No API key required.
 */

import type {
  WebSearchProvider,
  SearchOptions,
  SearchResponse,
  SearchResult,
  ProviderConfig,
} from './types.js';

export class SearxngProvider implements WebSearchProvider {
  name = 'searxng';
  private baseUrl: string;
  private categories: string;
  private language: string;

  constructor(config?: { baseUrl?: string; categories?: string; language?: string }) {
    this.baseUrl = config?.baseUrl || process.env.SEARXNG_BASE_URL || 'http://localhost:8888';
    this.categories = config?.categories || 'general';
    this.language = config?.language || 'en';
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Test if SearXNG instance is accessible
      const response = await fetch(`${this.baseUrl}/search?q=test&format=json`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const startTime = Date.now();
    const { numResults = 8, language = this.language, timeRange } = options;

    try {
      const results = await this.performSearch(query, {
        numResults,
        language,
        timeRange,
      });

      return {
        results,
        total: results.length,
        provider: this.name,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(
        `SearXNG search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getConfig(): ProviderConfig {
    return {
      name: this.name,
      baseUrl: this.baseUrl,
      requiresApiKey: false,
      rateLimit: 60, // SearXNG has no rate limits by default
    };
  }

  private async performSearch(
    query: string,
    options: {
      numResults: number;
      language: string;
      timeRange?: string;
    }
  ): Promise<SearchResult[]> {
    const { numResults, language, timeRange } = options;

    const params = new URLSearchParams({
      q: query,
      format: 'json',
      categories: this.categories,
      language,
      pageno: '1',
    });

    if (timeRange) {
      params.append('time_range', timeRange);
    }

    const response = await fetch(`${this.baseUrl}/search?${params.toString()}`, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return this.parseResults(data, numResults);
  }

  private parseResults(data: any, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];

    if (!data.results || !Array.isArray(data.results)) {
      return results;
    }

    for (const result of data.results.slice(0, maxResults)) {
      if (result.title && result.url) {
        results.push({
          title: result.title,
          url: result.url,
          snippet: result.content || result.snippet || '',
          source: result.engine || undefined,
          publishedDate: result.publishedDate || undefined,
        });
      }
    }

    return results;
  }
}
