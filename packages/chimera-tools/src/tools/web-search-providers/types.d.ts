/**
 * Web search provider types and interfaces for chimera.
 * Supports multiple search providers with automatic fallback.
 */
export interface SearchOptions {
    /** Number of results to return (1-50) */
    numResults?: number;
    /** Search type: fast, deep, or auto */
    type?: 'fast' | 'deep' | 'auto';
    /** Language code (e.g., 'en', 'es') */
    language?: string;
    /** Region code (e.g., 'us-en', 'uk-en') */
    region?: string;
    /** Safe search level: 'strict', 'moderate', or 'off' */
    safeSearch?: 'strict' | 'moderate' | 'off';
    /** Time range filter: 'day', 'week', 'month', 'year' */
    timeRange?: 'day' | 'week' | 'month' | 'year';
}
export interface SearchResult {
    /** Title of the search result */
    title: string;
    /** URL of the search result */
    url: string;
    /** Snippet or description of the result */
    snippet: string;
    /** Source/author if available */
    source?: string;
    /** Publication date if available */
    publishedDate?: string;
    /** Relevance score (0-1) if available */
    score?: number;
}
export interface SearchResponse {
    /** Array of search results */
    results: SearchResult[];
    /** Total number of results available */
    total: number;
    /** Provider that returned these results */
    provider: string;
    /** Search time in milliseconds */
    duration: number;
}
export interface WebSearchProvider {
    /** Name of the provider */
    name: string;
    /** Check if this provider is available */
    isAvailable(): Promise<boolean>;
    /** Perform a web search */
    search(query: string, options?: SearchOptions): Promise<SearchResponse>;
    /** Get provider-specific configuration */
    getConfig(): ProviderConfig;
}
export interface ProviderConfig {
    /** Provider name */
    name: string;
    /** Base URL for the provider */
    baseUrl?: string;
    /** API key (if required) */
    apiKey?: string;
    /** Rate limit (requests per minute) */
    rateLimit?: number;
    /** Whether this provider requires an API key */
    requiresApiKey: boolean;
}
export type ProviderPriority = 'high' | 'medium' | 'low';
export interface ProviderRegistration {
    provider: WebSearchProvider;
    priority: ProviderPriority;
    enabled: boolean;
}
//# sourceMappingURL=types.d.ts.map