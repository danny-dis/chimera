/**
 * DuckDuckGo search provider for chimera.
 * Free, no API key required. Uses DuckDuckGo's HTML search endpoint.
 */
import type { WebSearchProvider, SearchOptions, SearchResponse, ProviderConfig } from './types.js';
export declare class DuckDuckGoProvider implements WebSearchProvider {
    name: string;
    private baseUrl;
    private userAgent;
    isAvailable(): Promise<boolean>;
    search(query: string, options?: SearchOptions): Promise<SearchResponse>;
    getConfig(): ProviderConfig;
    private performSearch;
    private parseResults;
    private parseResultsFallback;
    private decodeHtmlEntities;
}
//# sourceMappingURL=duckduckgo.d.ts.map