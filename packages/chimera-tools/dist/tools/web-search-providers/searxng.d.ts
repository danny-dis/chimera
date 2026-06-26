/**
 * SearXNG search provider for chimera.
 * Free, self-hosted metasearch engine. No API key required.
 */
import type { WebSearchProvider, SearchOptions, SearchResponse, ProviderConfig } from './types.js';
export declare class SearxngProvider implements WebSearchProvider {
    name: string;
    private baseUrl;
    private categories;
    private language;
    constructor(config?: {
        baseUrl?: string;
        categories?: string;
        language?: string;
    });
    isAvailable(): Promise<boolean>;
    search(query: string, options?: SearchOptions): Promise<SearchResponse>;
    getConfig(): ProviderConfig;
    private performSearch;
    private parseResults;
}
//# sourceMappingURL=searxng.d.ts.map