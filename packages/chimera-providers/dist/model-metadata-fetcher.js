"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelMetadataFetcher = void 0;
exports.fetchAndCacheModelMetadata = fetchAndCacheModelMetadata;
exports.getModelEntriesFromAPI = getModelEntriesFromAPI;
const zod_1 = require("zod");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ── Constants ────────────────────────────────────────────────────────────
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/models';
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_TIMEOUT_MS = 10_000;
const CACHE_VERSION = 1;
// ── OpenRouter API Response Schema ───────────────────────────────────────
const OpenRouterModelSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    context_length: zod_1.z.number().int().positive(),
    top_provider: zod_1.z.object({
        context_length: zod_1.z.number().int().positive().optional(),
        max_completion_tokens: zod_1.z.number().int().positive().optional(),
        is_moderated: zod_1.z.boolean().optional(),
    }).optional(),
    pricing: zod_1.z.object({
        prompt: zod_1.z.string(),
        completion: zod_1.z.string(),
        input_cache_read: zod_1.z.string().optional(),
        input_cache_write: zod_1.z.string().optional(),
    }).optional(),
    architecture: zod_1.z.object({
        modality: zod_1.z.string().optional(),
        input_modalities: zod_1.z.array(zod_1.z.string()).optional(),
        output_modalities: zod_1.z.array(zod_1.z.string()).optional(),
        tokenizer: zod_1.z.string().optional(),
    }).optional(),
    supported_parameters: zod_1.z.array(zod_1.z.string()).optional(),
    reasoning: zod_1.z.object({
        mandatory: zod_1.z.boolean().optional(),
        default_enabled: zod_1.z.boolean().optional(),
        supported_efforts: zod_1.z.array(zod_1.z.string()).optional(),
    }).nullable().optional(),
    created: zod_1.z.number().optional(),
    knowledge_cutoff: zod_1.z.string().nullable().optional(),
}).passthrough();
const OpenRouterResponseSchema = zod_1.z.object({
    data: zod_1.z.array(OpenRouterModelSchema),
});
// ── Helper Functions ─────────────────────────────────────────────────────
function getDefaultCachePath() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(home, '.chimera', 'model-metadata-cache.json');
}
function ensureCacheDir(cachePath) {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
function parsePricing(priceStr) {
    if (!priceStr)
        return 0;
    const price = parseFloat(priceStr);
    // OpenRouter prices are per-token, convert to per-million
    return isNaN(price) ? 0 : price * 1_000_000;
}
function inferProviderFromId(modelId) {
    const parts = modelId.split('/');
    return parts.length > 1 ? parts[0] : 'unknown';
}
function inferCapabilities(model) {
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
function inferTier(inputPerMillion, outputPerMillion, supportsReasoning) {
    if (supportsReasoning)
        return 'reasoning';
    const avgCost = (inputPerMillion + outputPerMillion) / 2;
    if (avgCost < 1)
        return 'cheap';
    if (avgCost < 10)
        return 'mid';
    return 'frontier';
}
// ── Main Fetcher Class ───────────────────────────────────────────────────
class ModelMetadataFetcher {
    config;
    constructor(config = {}) {
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
    async fetchFromOpenRouter() {
        const headers = {
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
    transformModel(model) {
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
    loadFromCache() {
        try {
            if (!fs.existsSync(this.config.cachePath)) {
                return null;
            }
            const raw = fs.readFileSync(this.config.cachePath, 'utf-8');
            const cache = JSON.parse(raw);
            // Validate cache format
            if (cache.version !== CACHE_VERSION) {
                return null;
            }
            // Check if cache is expired
            if (Date.now() - cache.timestamp > this.config.cacheTtlMs) {
                return null;
            }
            return cache.metadata;
        }
        catch {
            return null;
        }
    }
    /**
     * Save metadata to local cache.
     */
    saveToCache(metadata) {
        ensureCacheDir(this.config.cachePath);
        const cache = {
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
    async getMetadata() {
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
    async refreshMetadata() {
        const metadata = await this.fetchFromOpenRouter();
        this.saveToCache(metadata);
        return metadata;
    }
    /**
     * Convert fetched metadata to ModelEntry format for use with ModelRegistry.
     */
    static toModelEntries(metadata) {
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
exports.ModelMetadataFetcher = ModelMetadataFetcher;
// ── Convenience Functions ────────────────────────────────────────────────
/**
 * Quick helper to fetch and cache model metadata.
 */
async function fetchAndCacheModelMetadata(config) {
    const fetcher = new ModelMetadataFetcher(config);
    return fetcher.getMetadata();
}
/**
 * Quick helper to get ModelEntry objects from cache or API.
 */
async function getModelEntriesFromAPI(config) {
    const metadata = await fetchAndCacheModelMetadata(config);
    return ModelMetadataFetcher.toModelEntries(metadata);
}
//# sourceMappingURL=model-metadata-fetcher.js.map