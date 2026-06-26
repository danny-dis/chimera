/**
 * Brave Search provider for chimera.
 * Requires free API key from https://brave.com/search/api/
 * Free tier: 2,000 queries/month
 */

import type {
  WebSearchProvider,
  SearchOptions,
  SearchResponse,
  SearchResult,
  ProviderConfig,
} from './types.js';

export class BraveSearchProvider implements WebSearchProvider {
  name = 'brave';
  private baseUrl = 'https://api.search.brave.com/res/v1/web/search';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.BRAVE_API_KEY || '';
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      // Test if Brave API is accessible with a minimal query
      const response = await fetch(`${this.baseUrl}?q=test&count=1`, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey,
        },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const startTime = Date.now();
    const { numResults = 8, language = 'en', country = 'US' } = options as any;

    if (!this.apiKey) {
      throw new Error('Brave Search API key is required. Set BRAVE_API_KEY environment variable.');
    }

    try {
      const results = await this.performSearch(query, {
        numResults,
        language,
        country,
      });

      return {
        results,
        total: results.length,
        provider: this.name,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(
        `Brave Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getConfig(): ProviderConfig {
    return {
      name: this.name,
      baseUrl: this.baseUrl,
      apiKey: this.apiKey ? '***' : undefined, // Mask API key
      requiresApiKey: true,
      rateLimit: 60, // Brave rate limit
    };
  }

  private async performSearch(
    query: string,
    options: {
      numResults: number;
      language: string;
      country: string;
    }
  ): Promise<SearchResult[]> {
    const { numResults, language, country } = options;

    const params = new URLSearchParams({
      q: query,
      count: Math.min(numResults, 20).toString(),
      search_lang: language,
      country,
    });

    const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': this.apiKey,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return this.parseResults(data, numResults);
  }

  private parseResults(data: any, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];

    if (!data.web || !data.web.results || !Array.isArray(data.web.results)) {
      return results;
    }

    for (const result of data.web.results.slice(0, maxResults)) {
      if (result.title && result.url) {
        results.push({
          title: result.title,
          url: result.url,
          snippet: result.description || '',
          source: result.profile?.name || undefined,
          publishedDate: result.age || undefined,
        });
      }
    }

    return results;
  }
}
