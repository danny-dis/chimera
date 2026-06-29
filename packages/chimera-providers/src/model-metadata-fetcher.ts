import { z } from 'zod';
import { ModelEntry } from './model-registry.js';
import * as fs from 'fs';
import * as path from 'path';

// ── Types ────────────────────────────────────────────────────────────────

export interface FetchedModelMetadata {
  /** Model ID in format 'provider/model-name' */
  id: string;
  /** Human-readable name */
  name: string;
  /** Provider name */
  provider: string;
  /** Context window size in tokens */
  contextWindow: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** Input cost per million tokens */
  inputPerMillion: number;
  /** Output cost per million tokens */
  outputPerMillion: number;
  /** Cache read cost per million tokens (if available) */
  cacheReadPerMillion?: number;
  /** Cache write cost per million tokens (if available) */
  cacheWritePerMillion?: number;
  /** Whether the model supports tool calling */
  supportsToolCalling: boolean;
  /** Whether the model supports structured output */
  supportsStructuredOutput: boolean;
  /** Whether the model supports vision */
  supportsVision: boolean;
  /** Whether the model supports reasoning */
  supportsReasoning: boolean;
  /** Whether the model supports parallel tool calls */
  supportsParallelToolCalls: boolean;
  /** ISO date string of when the model was released */
  releaseDate?: string;
  /** Knowledge cutoff date */
  knowledgeCutoff?: string;
  /** Timestamp when this metadata was fetched */
  fetchedAt: number;
}

export interface CacheEntry {
  /** The fetched metadata */
  metadata: FetchedModelMetadata[];
  /** Timestamp when the cache was created */
  timestamp: number;
  /** Version of the cache format */
  version: number;
}

export interface FetcherConfig {
  /** OpenRouter API key (optional - anonymous access available with rate limits) */
  openrouterApiKey?: string;
  /** Cache file path (defaults to ~/.chimera/model-metadata-cache.json) */
  cachePath?: string;
  /** Cache TTL in milliseconds (defaults to 24 hours) */
  cacheTtlMs?: number;
  /** Request timeout in milliseconds (defaults to 10 seconds) */
  timeoutMs?: number;
}

// ── Constants ────────────────────────────────────────────────────────────

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/models';
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_TIMEOUT_MS = 10_000;
const CACHE_VERSION = 1;

// ── OpenRouter API Response Schema ───────────────────────────────────────

const OpenRouterModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  context_length: z.number().int().positive(),
  top_provider: z.object({
    context_length: z.number().int().positive().optional(),
    max_completion_tokens: z.number().int().positive().optional(),
    is_moderated: z.boolean().optional(),
  }).optional(),
  pricing: z.object({
    prompt: z.string(),
    completion: z.string(),
    input_cache_read: z.string().optional(),
    input_cache_write: z.string().optional(),
  }).optional(),
  architecture: z.object({
    modality: z.string().optional(),
    input_modalities: z.array(z.string()).optional(),
    output_modalities: z.array(z.string()).optional(),
    tokenizer: z.string().optional(),
  }).optional(),
  supported_parameters: z.array(z.string()).optional(),
  reasoning: z.object({
    mandatory: z.boolean().optional(),
    default_enabled: z.boolean().optional(),
    supported_efforts: z.array(z.string()).optional(),
  }).nullable().optional(),
  created: z.number().optional(),
  knowledge_cutoff: z.string().nullable().optional(),
}).passthrough();

const OpenRouterResponseSchema = z.object({
  data: z.array(OpenRouterModelSchema),
});

// ── Helper Functions ─────────────────────────────────────────────────────

function getDefaultCachePath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.chimera', 'model-metadata-cache.json');
}

function ensureCacheDir(cachePath: string): void {
  const dir = path.dirname(cachePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function parsePricing(priceStr: string | undefined): number {
  if (!priceStr) return 0;
  const price = parseFloat(priceStr);
  // OpenRouter prices are per-token, convert to per-million
  return isNaN(price) ? 0 : price * 1_000_000;
}

function inferProviderFromId(modelId: string): string {
  const parts = modelId.split('/');
  return parts.length > 1 ? parts[0] : 'unknown';
}

function inferCapabilities(
  model: z.infer<typeof OpenRouterModelSchema>,
): {
  toolCalling: boolean;
  structuredOutput: boolean;
  vision: boolean;
  reasoning: boolean;
  parallelToolCalls: boolean;
} {
  const params = model.supported_parameters ?? [];
  const modality = model.architecture?.modality ?? '';

  return {
    toolCalling: params.includes('tools') || params.includes('tool_choice'),
    structuredOutput: params.includes('response_format') || params.includes('structured_outputs'),
    vision: modality.includes('image') || modality.includes('video'),
    reasoning: !!model.reasoning || params.includes('reasoning'),
    parallelToolCalls: params.includes('tools'), // Assume tools implies parallel
  };
}

function inferTier(
  inputPerMillion: number,
  outputPerMillion: number,
  supportsReasoning: boolean,
): 'cheap' | 'mid' | 'frontier' | 'reasoning' {
  if (supportsReasoning) return 'reasoning';
  const avgCost = (inputPerMillion + outputPerMillion) / 2;
  if (avgCost < 1) return 'cheap';
  if (avgCost < 10) return 'mid';
  return 'frontier';
}

// ── Main Fetcher Class ───────────────────────────────────────────────────

export class ModelMetadataFetcher {
  private config: Required<FetcherConfig>;

  constructor(config: FetcherConfig = {}) {
    this.config = {
      openrouterApiKey: config.openrouterApiKey ?? '',
      cachePath: config.cachePath ?? getDefaultCachePath(),
      cacheTtlMs: config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  /**
   * Fetch model metadata from OpenRouter API.
   * Returns an array of FetchedModelMetadata objects.
   */
  async fetchFromOpenRouter(): Promise<FetchedModelMetadata[]> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/danny-dis/chimera',
      'X-Title': 'Chimera',
    };

    if (this.config.openrouterApiKey) {
      headers['Authorization'] = `Bearer ${this.config.openrouterApiKey}`;
    }

    const response = await fetch(OPENROUTER_API_URL, {
      headers,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const parsed = OpenRouterResponseSchema.parse(data);

    return parsed.data
      .filter((model) => {
        // Only include text-capable models
        const modality = model.architecture?.modality ?? '';
        return modality.includes('text');
      })
      .map((model) => this.transformModel(model));
  }

  /**
   * Transform an OpenRouter model into our metadata format.
   */
  private transformModel(model: z.infer<typeof OpenRouterModelSchema>): FetchedModelMetadata {
    const pricing = model.pricing ?? { prompt: '0', completion: '0' };
    const inputPerMillion = parsePricing(pricing.prompt);
    const outputPerMillion = parsePricing(pricing.completion);
    const capabilities = inferCapabilities(model);

    return {
      id: model.id,
      name: model.name,
      provider: inferProviderFromId(model.id),
      contextWindow: model.top_provider?.context_length ?? model.context_length,
      maxOutputTokens: model.top_provider?.max_completion_tokens ?? 4096,
      inputPerMillion,
      outputPerMillion,
      cacheReadPerMillion: parsePricing(pricing.input_cache_read) || undefined,
      cacheWritePerMillion: parsePricing(pricing.input_cache_write) || undefined,
      supportsToolCalling: capabilities.toolCalling,
      supportsStructuredOutput: capabilities.structuredOutput,
      supportsVision: capabilities.vision,
      supportsReasoning: capabilities.reasoning,
      supportsParallelToolCalls: capabilities.parallelToolCalls,
      releaseDate: model.created ? new Date(model.created * 1000).toISOString().slice(0, 10) : undefined,
      knowledgeCutoff: model.knowledge_cutoff ?? undefined,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Load metadata from local cache if valid.
   * Returns null if cache is missing, expired, or invalid.
   */
  loadFromCache(): FetchedModelMetadata[] | null {
    try {
      if (!fs.existsSync(this.config.cachePath)) {
        return null;
      }

      const raw = fs.readFileSync(this.config.cachePath, 'utf-8');
      const cache: CacheEntry = JSON.parse(raw);

      // Validate cache format
      if (cache.version !== CACHE_VERSION) {
        return null;
      }

      // Check if cache is expired
      if (Date.now() - cache.timestamp > this.config.cacheTtlMs) {
        return null;
      }

      return cache.metadata;
    } catch {
      return null;
    }
  }

  /**
   * Save metadata to local cache.
   */
  saveToCache(metadata: FetchedModelMetadata[]): void {
    ensureCacheDir(this.config.cachePath);

    const cache: CacheEntry = {
      metadata,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    };

    fs.writeFileSync(this.config.cachePath, JSON.stringify(cache, null, 2), 'utf-8');
  }

  /**
   * Get model metadata, using cache if valid or fetching fresh data.
   * This is the main method to use for most cases.
   */
  async getMetadata(): Promise<FetchedModelMetadata[]> {
    // Try cache first
    const cached = this.loadFromCache();
    if (cached) {
      return cached;
    }

    // Fetch fresh data
    const metadata = await this.fetchFromOpenRouter();
    this.saveToCache(metadata);
    return metadata;
  }

  /**
   * Force refresh metadata from API, ignoring cache.
   */
  async refreshMetadata(): Promise<FetchedModelMetadata[]> {
    const metadata = await this.fetchFromOpenRouter();
    this.saveToCache(metadata);
    return metadata;
  }

  /**
   * Convert fetched metadata to ModelEntry format for use with ModelRegistry.
   */
  static toModelEntries(metadata: FetchedModelMetadata[]): ModelEntry[] {
    return metadata.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
      pricing: {
        inputPerMillion: m.inputPerMillion,
        outputPerMillion: m.outputPerMillion,
        cacheReadPerMillion: m.cacheReadPerMillion,
        cacheWritePerMillion: m.cacheWritePerMillion,
      },
      capabilities: {
        toolCalling: m.supportsToolCalling,
        structuredOutput: m.supportsStructuredOutput,
        vision: m.supportsVision,
        reasoning: m.supportsReasoning,
        parallelToolCalls: m.supportsParallelToolCalls,
      },
      degradationThreshold: 0.7, // Default threshold
      tier: inferTier(m.inputPerMillion, m.outputPerMillion, m.supportsReasoning),
      releaseDate: m.releaseDate,
    }));
  }
}

// ── Convenience Functions ────────────────────────────────────────────────

/**
 * Quick helper to fetch and cache model metadata.
 */
export async function fetchAndCacheModelMetadata(
  config?: FetcherConfig,
): Promise<FetchedModelMetadata[]> {
  const fetcher = new ModelMetadataFetcher(config);
  return fetcher.getMetadata();
}

/**
 * Quick helper to get ModelEntry objects from cache or API.
 */
export async function getModelEntriesFromAPI(
  config?: FetcherConfig,
): Promise<ModelEntry[]> {
  const metadata = await fetchAndCacheModelMetadata(config);
  return ModelMetadataFetcher.toModelEntries(metadata);
}
