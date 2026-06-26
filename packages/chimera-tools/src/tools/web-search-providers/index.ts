/**
 * Web search providers for chimera.
 * Export all providers and the provider manager.
 */

export { DuckDuckGoProvider } from './duckduckgo.js';
export { SearxngProvider } from './searxng.js';
export { BraveSearchProvider } from './brave.js';
export { WebSearchProviderManager } from './provider-manager.js';

export type {
  WebSearchProvider,
  SearchOptions,
  SearchResponse,
  SearchResult,
  ProviderConfig,
  ProviderPriority,
  ProviderRegistration,
} from './types.js';
