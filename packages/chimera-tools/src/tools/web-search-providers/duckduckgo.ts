/**
 * DuckDuckGo search provider for chimera.
 * Free, no API key required. Uses DuckDuckGo's HTML search endpoint.
 */

import type {
  WebSearchProvider,
  SearchOptions,
  SearchResponse,
  SearchResult,
  ProviderConfig,
} from './types.js';

export class DuckDuckGoProvider implements WebSearchProvider {
  name = 'duckduckgo';
  private baseUrl = 'https://html.duckduckgo.com/html/';
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  async isAvailable(): Promise<boolean> {
    try {
      // Test if DuckDuckGo is accessible with a minimal search
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.userAgent,
        },
        body: 'q=test&kl=us-en',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const startTime = Date.now();
    const { numResults = 8, region = 'us-en', safeSearch = 'moderate' } = options;

    try {
      const results = await this.performSearch(query, {
        numResults,
        region,
        safeSearch,
      });

      return {
        results,
        total: results.length,
        provider: this.name,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(
        `DuckDuckGo search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getConfig(): ProviderConfig {
    return {
      name: this.name,
      requiresApiKey: false,
      rateLimit: 30, // Conservative rate limit
    };
  }

  private async performSearch(
    query: string,
    options: {
      numResults: number;
      region: string;
      safeSearch: string;
    }
  ): Promise<SearchResult[]> {
    const { numResults, region, safeSearch } = options;

    // Build form data for DuckDuckGo HTML search
    const formData = new URLSearchParams();
    formData.append('q', query);
    formData.append('kl', region);
    formData.append('safe', safeSearch === 'strict' ? '1' : safeSearch === 'moderate' ? 'medium' : '0');

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.userAgent,
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return this.parseResults(html, numResults);
  }

  private parseResults(html: string, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];

    // Parse DuckDuckGo HTML results
    // Results are in <div class="result"> elements with <a class="result__a"> links
    // The href can appear before or after the class attribute
    const resultRegex = /<div class="result[^"]*"[^>]*>[\s\S]*?<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const resultRegex2 = /<div class="result[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      const [, url, titleHtml, snippetHtml] = match;
      
      if (url && titleHtml && snippetHtml) {
        const title = this.decodeHtmlEntities(titleHtml.replace(/<[^>]+>/g, '').trim());
        const snippet = this.decodeHtmlEntities(snippetHtml.replace(/<[^>]+>/g, '').trim());
        const decodedUrl = this.decodeHtmlEntities(url);

        if (title && decodedUrl && snippet) {
          results.push({
            title,
            url: decodedUrl,
            snippet,
          });
        }
      }
    }

    // Try second regex pattern if first didn't find results
    if (results.length === 0) {
      while ((match = resultRegex2.exec(html)) !== null && results.length < maxResults) {
        const [, url, titleHtml, snippetHtml] = match;
        
        if (url && titleHtml && snippetHtml) {
          const title = this.decodeHtmlEntities(titleHtml.replace(/<[^>]+>/g, '').trim());
          const snippet = this.decodeHtmlEntities(snippetHtml.replace(/<[^>]+>/g, '').trim());
          const decodedUrl = this.decodeHtmlEntities(url);

          if (title && decodedUrl && snippet) {
            results.push({
              title,
              url: decodedUrl,
              snippet,
            });
          }
        }
      }
    }

    // Fallback: try alternative parsing if regex didn't work well
    if (results.length === 0) {
      return this.parseResultsFallback(html, maxResults);
    }

    return results;
  }

  private parseResultsFallback(html: string, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];

    // Try simpler regex patterns
    const linkRegex = /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*class="result__a"[^>]*>(.*?)<\/a>/gi;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gi;

    const links: { url: string; title: string }[] = [];
    const snippets: string[] = [];

    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const [, url, titleHtml] = match;
      if (url && titleHtml) {
        links.push({
          url: this.decodeHtmlEntities(url),
          title: this.decodeHtmlEntities(titleHtml.replace(/<[^>]+>/g, '').trim()),
        });
      }
    }

    while ((match = snippetRegex.exec(html)) !== null) {
      const [, snippetHtml] = match;
      if (snippetHtml) {
        snippets.push(this.decodeHtmlEntities(snippetHtml.replace(/<[^>]+>/g, '').trim()));
      }
    }

    // Combine results
    for (let i = 0; i < Math.min(links.length, snippets.length, maxResults); i++) {
      const { url, title } = links[i];
      if (title && url) {
        results.push({
          title,
          url,
          snippet: snippets[i] || '',
        });
      }
    }

    return results;
  }

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  }
}
