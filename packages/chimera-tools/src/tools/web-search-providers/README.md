# Web Search Providers for Chimera

Chimera supports multiple web search providers with automatic fallback. The system is designed to work completely free out of the box, with optional paid upgrades for better results.

## Providers

### 1. DuckDuckGo (Free, No API Key)

**Status**: ✅ Works out of the box  
**Cost**: Free  
**Rate Limit**: ~30 requests/minute  

DuckDuckGo is the default provider. It requires no configuration and works immediately.

```typescript
import { DuckDuckGoProvider } from './duckduckgo.js';

const provider = new DuckDuckGoProvider();
const results = await provider.search('your query');
```

### 2. SearXNG (Free, Self-Hosted)

**Status**: ✅ Works if you have a SearXNG instance  
**Cost**: Free  
**Rate Limit**: Unlimited (self-hosted)  

SearXNG is a privacy-focused metasearch engine that aggregates results from 70+ search engines.

**Setup**:
```bash
# Run SearXNG with Docker
docker run -d -p 8888:8080 searxng/searxng
```

**Configuration**:
```bash
# Set environment variable
export SEARXNG_BASE_URL=http://localhost:8888
```

```typescript
import { SearxngProvider } from './searxng.js';

const provider = new SearxngProvider({ baseUrl: 'http://localhost:8888' });
const results = await provider.search('your query');
```

### 3. Brave Search (Paid, Free Tier Available)

**Status**: ✅ Works with API key  
**Cost**: Free tier (2,000 queries/month), then $5/1k queries  
**Rate Limit**: 60 requests/minute  

Brave Search provides high-quality results with an official API.

**Setup**:
1. Get API key at https://brave.com/search/api/
2. Set environment variable:
```bash
export BRAVE_API_KEY=your-api-key-here
```

```typescript
import { BraveSearchProvider } from './brave.js';

const provider = new BraveSearchProvider('your-api-key');
const results = await provider.search('your query');
```

## Provider Manager

The `WebSearchProviderManager` handles automatic provider selection and fallback:

```typescript
import { WebSearchProviderManager } from './provider-manager.js';

const manager = new WebSearchProviderManager();

// Automatically uses the best available provider
const results = await manager.search('your query');

// Check available providers
const providers = await manager.getAvailableProviders();

// Enable/disable providers
manager.setProviderEnabled('duckduckgo', false);

// Clear cache
manager.clearCache();
```

## Configuration

### Environment Variables

```bash
# Optional: SearXNG instance URL
SEARXNG_BASE_URL=http://localhost:8888

# Optional: Brave Search API key
BRAVE_API_KEY=your-api-key-here
```

### Provider Priority

Providers are tried in this order:
1. **DuckDuckGo** (always available, free, no API key required)
2. **SearXNG** (if instance running, free, self-hosted)
3. **Brave** (if API key configured, paid with free tier)

## Caching

Search results are cached for 5 minutes to reduce API calls. The cache is automatically managed by the provider manager.

## Testing

Run tests with:
```bash
npm test -- --run src/__tests__/web-search-providers.test.ts
```

## Adding Custom Providers

To add a new search provider:

1. Create a new file in `web-search-providers/`
2. Implement the `WebSearchProvider` interface
3. Register the provider in `provider-manager.ts`

```typescript
import { WebSearchProvider, SearchOptions, SearchResponse } from './types.js';

export class CustomProvider implements WebSearchProvider {
  name = 'custom';

  async isAvailable(): Promise<boolean> {
    // Check if provider is reachable
    return true;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
    // Implement search logic
    return {
      results: [],
      total: 0,
      provider: this.name,
      duration: 0,
    };
  }

  getConfig() {
    return {
      name: this.name,
      requiresApiKey: false,
    };
  }
}
```

## Troubleshooting

### DuckDuckGo not working
- Check network connectivity
- DuckDuckGo may rate-limit heavy usage
- Try using SearXNG as an alternative

### SearXNG not working
- Ensure SearXNG instance is running
- Check if JSON format is enabled in SearXNG config
- Verify `SEARXNG_BASE_URL` is correct

### Brave Search not working
- Verify API key is correct
- Check if you've exceeded the free tier limit
- Ensure API key has proper permissions
