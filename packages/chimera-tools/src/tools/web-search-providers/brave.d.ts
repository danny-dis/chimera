/**
 * Brave Search provider for chimera.
 * Requires free API key from https://brave.com/search/api/
 * Free tier: 2,000 queries/month
 */
import type { WebSearchProvider, SearchOptions, SearchResponse, ProviderConfig } from './types.js';
export declare class BraveSearchProvider implements WebSearchProvider {
    name: string;
    private baseUrl;
    private apiKey;
    constructor(apiKey?: string);
    isAvailable(): Promise<boolean>;
    search(query: string, options?: SearchOptions): Promise<SearchResponse>;
    getConfig(): ProviderConfig;
    private performSearch;
    private parseResults;
}
//# sourceMappingURL=brave.d.ts.map