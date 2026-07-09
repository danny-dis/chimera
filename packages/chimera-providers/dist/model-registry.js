"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelRegistry = exports.ModelEntrySchema = void 0;
const zod_1 = require("zod");
exports.ModelEntrySchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    provider: zod_1.z.string(),
    contextWindow: zod_1.z.number().int().positive(),
    maxOutputTokens: zod_1.z.number().int().positive(),
    pricing: zod_1.z.object({
        inputPerMillion: zod_1.z.number().nonnegative(),
        outputPerMillion: zod_1.z.number().nonnegative(),
        cacheReadPerMillion: zod_1.z.number().nonnegative().optional(),
        cacheWritePerMillion: zod_1.z.number().nonnegative().optional(),
    }),
    capabilities: zod_1.z.object({
        toolCalling: zod_1.z.boolean(),
        structuredOutput: zod_1.z.boolean(),
        vision: zod_1.z.boolean(),
        reasoning: zod_1.z.boolean(),
        parallelToolCalls: zod_1.z.boolean(),
    }),
    degradationThreshold: zod_1.z.number().min(0).max(1),
    tier: zod_1.z.enum(['cheap', 'mid', 'frontier', 'reasoning']),
    releaseDate: zod_1.z.string().optional(),
    deprecated: zod_1.z.boolean().optional(),
    replacement: zod_1.z.string().optional(),
    /** Timestamp when this metadata was fetched from API (0 = hardcoded) */
    fetchedAt: zod_1.z.number().optional(),
});
const MODELS = [
    // ── Cheap tier ──
    {
        id: 'deepseek/deepseek-v3',
        name: 'DeepSeek V3',
        provider: 'deepseek',
        contextWindow: 128_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 0.27, outputPerMillion: 1.10, cacheReadPerMillion: 0.07, cacheWritePerMillion: 0.14 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.75,
        tier: 'cheap',
        releaseDate: '2024-12-26',
    },
    {
        id: 'qwen/qwen-2.5-72b',
        name: 'Qwen 2.5 72B',
        provider: 'qwen',
        contextWindow: 131_072,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 0.40, outputPerMillion: 1.20 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.70,
        tier: 'cheap',
        releaseDate: '2024-09-19',
    },
    {
        id: 'moonshot/kimi-k2',
        name: 'Kimi K2',
        provider: 'moonshot',
        contextWindow: 128_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 0.30, outputPerMillion: 0.90 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
        degradationThreshold: 0.70,
        tier: 'cheap',
        releaseDate: '2025-04-15',
    },
    {
        id: 'google/gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        provider: 'google',
        contextWindow: 1_048_576,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 0.10, outputPerMillion: 0.40, cacheReadPerMillion: 0.025, cacheWritePerMillion: 0.05 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.80,
        tier: 'cheap',
        releaseDate: '2024-12-11',
    },
    {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o-mini',
        provider: 'openai',
        contextWindow: 128_000,
        maxOutputTokens: 16_384,
        pricing: { inputPerMillion: 0.15, outputPerMillion: 0.60, cacheReadPerMillion: 0.075, cacheWritePerMillion: 0.15 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.70,
        tier: 'cheap',
        releaseDate: '2024-07-18',
    },
    {
        id: 'anthropic/claude-haiku-3.5',
        name: 'Claude Haiku 3.5',
        provider: 'anthropic',
        contextWindow: 200_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 0.80, outputPerMillion: 4.00, cacheReadPerMillion: 0.08, cacheWritePerMillion: 1.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.65,
        tier: 'cheap',
        releaseDate: '2024-10-22',
    },
    // ── Mid tier ──
    {
        id: 'anthropic/claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        provider: 'anthropic',
        contextWindow: 200_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 3.00, outputPerMillion: 15.00, cacheReadPerMillion: 0.30, cacheWritePerMillion: 3.75 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.65,
        tier: 'mid',
        releaseDate: '2025-05-14',
    },
    {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        contextWindow: 128_000,
        maxOutputTokens: 16_384,
        pricing: { inputPerMillion: 2.50, outputPerMillion: 10.00, cacheReadPerMillion: 1.25, cacheWritePerMillion: 2.50 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.70,
        tier: 'mid',
        releaseDate: '2024-05-13',
    },
    {
        id: 'google/gemini-2.0-pro',
        name: 'Gemini 2.0 Pro',
        provider: 'google',
        contextWindow: 2_097_152,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 1.25, outputPerMillion: 5.00, cacheReadPerMillion: 0.31, cacheWritePerMillion: 0.63 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.80,
        tier: 'mid',
        releaseDate: '2025-02-05',
    },
    {
        id: 'deepseek/deepseek-r1',
        name: 'DeepSeek R1',
        provider: 'deepseek',
        contextWindow: 128_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 0.55, outputPerMillion: 2.19, cacheReadPerMillion: 0.14, cacheWritePerMillion: 0.28 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: true, parallelToolCalls: false },
        degradationThreshold: 0.70,
        tier: 'mid',
        releaseDate: '2025-01-20',
    },
    {
        id: 'qwen/qwen3.5-plus',
        name: 'Qwen3.5 Plus',
        provider: 'qwen',
        contextWindow: 131_072,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 1.50, outputPerMillion: 5.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.70,
        tier: 'mid',
        releaseDate: '2025-09-23',
    },
    // ── Frontier tier ──
    {
        id: 'anthropic/claude-opus-4',
        name: 'Claude Opus 4',
        provider: 'anthropic',
        contextWindow: 200_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 15.00, outputPerMillion: 75.00, cacheReadPerMillion: 1.50, cacheWritePerMillion: 18.75 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.60,
        tier: 'frontier',
        releaseDate: '2025-08-14',
    },
    {
        id: 'openai/gpt-5',
        name: 'GPT-5',
        provider: 'openai',
        contextWindow: 256_000,
        maxOutputTokens: 32_768,
        pricing: { inputPerMillion: 10.00, outputPerMillion: 50.00, cacheReadPerMillion: 2.50, cacheWritePerMillion: 5.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.65,
        tier: 'frontier',
        releaseDate: '2025-11-15',
    },
    {
        id: 'google/gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        provider: 'google',
        contextWindow: 1_048_576,
        maxOutputTokens: 65_536,
        pricing: { inputPerMillion: 2.50, outputPerMillion: 15.00, cacheReadPerMillion: 0.63, cacheWritePerMillion: 1.25 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.75,
        tier: 'frontier',
        releaseDate: '2025-06-12',
    },
    {
        id: 'anthropic/claude-sonnet-4.5',
        name: 'Claude Sonnet 4.5',
        provider: 'anthropic',
        contextWindow: 200_000,
        maxOutputTokens: 16_384,
        pricing: { inputPerMillion: 5.00, outputPerMillion: 25.00, cacheReadPerMillion: 0.50, cacheWritePerMillion: 6.25 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.65,
        tier: 'frontier',
        releaseDate: '2026-01-15',
    },
    // ── Reasoning tier ──
    {
        id: 'openai/o3-mini',
        name: 'o3-mini',
        provider: 'openai',
        contextWindow: 200_000,
        maxOutputTokens: 32_768,
        pricing: { inputPerMillion: 1.10, outputPerMillion: 4.40, cacheReadPerMillion: 0.55, cacheWritePerMillion: 1.10 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: true, parallelToolCalls: false },
        degradationThreshold: 0.65,
        tier: 'reasoning',
        releaseDate: '2025-01-31',
    },
    {
        id: 'openai/o4-mini',
        name: 'o4-mini',
        provider: 'openai',
        contextWindow: 200_000,
        maxOutputTokens: 32_768,
        pricing: { inputPerMillion: 1.50, outputPerMillion: 6.00, cacheReadPerMillion: 0.75, cacheWritePerMillion: 1.50 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: true, parallelToolCalls: false },
        degradationThreshold: 0.65,
        tier: 'reasoning',
        releaseDate: '2025-10-01',
    },
    {
        id: 'anthropic/claude-r1',
        name: 'Claude R1',
        provider: 'anthropic',
        contextWindow: 200_000,
        maxOutputTokens: 16_384,
        pricing: { inputPerMillion: 5.00, outputPerMillion: 25.00, cacheReadPerMillion: 0.50, cacheWritePerMillion: 6.25 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.60,
        tier: 'reasoning',
        releaseDate: '2026-02-10',
    },
    {
        id: 'deepseek/deepseek-r1-v2',
        name: 'DeepSeek R1 V2',
        provider: 'deepseek',
        contextWindow: 128_000,
        maxOutputTokens: 16_384,
        pricing: { inputPerMillion: 0.80, outputPerMillion: 3.20, cacheReadPerMillion: 0.20, cacheWritePerMillion: 0.40 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: true, parallelToolCalls: false },
        degradationThreshold: 0.70,
        tier: 'reasoning',
        releaseDate: '2025-11-01',
    },
    // ── Additional cheap models ──
    {
        id: 'google/gemini-2.0-flash-lite',
        name: 'Gemini 2.0 Flash-Lite',
        provider: 'google',
        contextWindow: 1_048_576,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 0.075, outputPerMillion: 0.30, cacheReadPerMillion: 0.019, cacheWritePerMillion: 0.038 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.85,
        tier: 'cheap',
        releaseDate: '2025-03-01',
    },
    {
        id: 'mistral/mistral-small-3.1',
        name: 'Mistral Small 3.1',
        provider: 'mistral',
        contextWindow: 128_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 0.10, outputPerMillion: 0.30 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.75,
        tier: 'cheap',
        releaseDate: '2025-03-18',
    },
    {
        id: 'meta/llama-4-maverick',
        name: 'Llama 4 Maverick',
        provider: 'meta',
        contextWindow: 128_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 0.20, outputPerMillion: 0.60 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.75,
        tier: 'cheap',
        releaseDate: '2025-04-05',
    },
    // ── Additional mid models ──
    {
        id: 'mistral/mistral-large-2',
        name: 'Mistral Large 2',
        provider: 'mistral',
        contextWindow: 128_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 2.00, outputPerMillion: 6.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.70,
        tier: 'mid',
        releaseDate: '2024-07-24',
    },
    {
        id: 'cohere/command-r-plus',
        name: 'Command R+',
        provider: 'cohere',
        contextWindow: 128_000,
        maxOutputTokens: 4_096,
        pricing: { inputPerMillion: 2.50, outputPerMillion: 10.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.70,
        tier: 'mid',
        releaseDate: '2024-04-04',
    },
    // ── Additional frontier models ──
    {
        id: 'google/gemini-2.5-ultra',
        name: 'Gemini 2.5 Ultra',
        provider: 'google',
        contextWindow: 1_048_576,
        maxOutputTokens: 131_072,
        pricing: { inputPerMillion: 5.00, outputPerMillion: 30.00, cacheReadPerMillion: 1.25, cacheWritePerMillion: 2.50 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.70,
        tier: 'frontier',
        releaseDate: '2025-12-01',
    },
    {
        id: 'meta/llama-4-opus',
        name: 'Llama 4 Opus',
        provider: 'meta',
        contextWindow: 256_000,
        maxOutputTokens: 32_768,
        pricing: { inputPerMillion: 8.00, outputPerMillion: 40.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.65,
        tier: 'frontier',
        releaseDate: '2025-07-20',
    },
    {
        id: 'xai/grok-4',
        name: 'Grok 4',
        provider: 'xai',
        contextWindow: 1_048_576,
        maxOutputTokens: 32_768,
        pricing: { inputPerMillion: 5.00, outputPerMillion: 25.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.65,
        tier: 'frontier',
        releaseDate: '2025-10-01',
    },
    {
        id: 'xai/grok-4.1',
        name: 'Grok 4.1',
        provider: 'xai',
        contextWindow: 1_048_576,
        maxOutputTokens: 32_768,
        pricing: { inputPerMillion: 5.00, outputPerMillion: 25.00, cacheReadPerMillion: 2.50, cacheWritePerMillion: 5.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.65,
        tier: 'frontier',
        releaseDate: '2026-03-15',
    },
    {
        id: 'xai/grok-4-fast',
        name: 'Grok 4 Fast',
        provider: 'xai',
        contextWindow: 256_000,
        maxOutputTokens: 16_384,
        pricing: { inputPerMillion: 1.50, outputPerMillion: 7.50 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.70,
        tier: 'cheap',
        releaseDate: '2026-01-20',
    },
    {
        id: 'perplexity/sonar',
        name: 'Sonar',
        provider: 'perplexity',
        contextWindow: 256_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 1.00, outputPerMillion: 5.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: true, parallelToolCalls: false },
        degradationThreshold: 0.65,
        tier: 'reasoning',
        releaseDate: '2025-06-01',
    },
    {
        id: 'perplexity/sonar-pro',
        name: 'Sonar Pro',
        provider: 'perplexity',
        contextWindow: 256_000,
        maxOutputTokens: 16_384,
        pricing: { inputPerMillion: 5.00, outputPerMillion: 25.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.60,
        tier: 'frontier',
        releaseDate: '2025-08-01',
    },
    {
        id: 'openai/gpt-5-mini',
        name: 'GPT-5 Mini',
        provider: 'openai',
        contextWindow: 128_000,
        maxOutputTokens: 16_384,
        pricing: { inputPerMillion: 0.50, outputPerMillion: 2.00, cacheReadPerMillion: 0.25, cacheWritePerMillion: 0.50 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.70,
        tier: 'cheap',
        releaseDate: '2025-12-01',
    },
    {
        id: 'openai/gpt-5-nano',
        name: 'GPT-5 Nano',
        provider: 'openai',
        contextWindow: 64_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 0.15, outputPerMillion: 0.60, cacheReadPerMillion: 0.075, cacheWritePerMillion: 0.15 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.75,
        tier: 'cheap',
        releaseDate: '2025-12-01',
    },
    {
        id: 'openai/o3',
        name: 'o3',
        provider: 'openai',
        contextWindow: 200_000,
        maxOutputTokens: 100_000,
        pricing: { inputPerMillion: 10.00, outputPerMillion: 50.00, cacheReadPerMillion: 2.50, cacheWritePerMillion: 5.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.60,
        tier: 'reasoning',
        releaseDate: '2025-10-01',
    },
    {
        id: 'anthropic/claude-opus-4.1',
        name: 'Claude Opus 4.1',
        provider: 'anthropic',
        contextWindow: 200_000,
        maxOutputTokens: 16_384,
        pricing: { inputPerMillion: 15.00, outputPerMillion: 75.00, cacheReadPerMillion: 1.50, cacheWritePerMillion: 18.75 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.60,
        tier: 'frontier',
        releaseDate: '2026-04-01',
    },
    {
        id: 'anthropic/claude-haiku-4.5',
        name: 'Claude Haiku 4.5',
        provider: 'anthropic',
        contextWindow: 200_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 1.00, outputPerMillion: 5.00, cacheReadPerMillion: 0.10, cacheWritePerMillion: 1.25 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.65,
        tier: 'cheap',
        releaseDate: '2026-03-01',
    },
    {
        id: 'google/gemini-3-pro',
        name: 'Gemini 3 Pro',
        provider: 'google',
        contextWindow: 2_097_152,
        maxOutputTokens: 131_072,
        pricing: { inputPerMillion: 5.00, outputPerMillion: 25.00, cacheReadPerMillion: 1.25, cacheWritePerMillion: 2.50 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.70,
        tier: 'frontier',
        releaseDate: '2026-05-01',
    },
    {
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'google',
        contextWindow: 1_048_576,
        maxOutputTokens: 32_768,
        pricing: { inputPerMillion: 0.15, outputPerMillion: 0.60, cacheReadPerMillion: 0.038, cacheWritePerMillion: 0.075 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.80,
        tier: 'cheap',
        releaseDate: '2025-09-15',
    },
    {
        id: 'google/gemini-2.5-flash-lite',
        name: 'Gemini 2.5 Flash Lite',
        provider: 'google',
        contextWindow: 1_048_576,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 0.075, outputPerMillion: 0.30, cacheReadPerMillion: 0.019, cacheWritePerMillion: 0.038 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.85,
        tier: 'cheap',
        releaseDate: '2025-11-01',
    },
    {
        id: 'deepseek/deepseek-v4',
        name: 'DeepSeek V4',
        provider: 'deepseek',
        contextWindow: 256_000,
        maxOutputTokens: 32_768,
        pricing: { inputPerMillion: 2.00, outputPerMillion: 8.00, cacheReadPerMillion: 0.50, cacheWritePerMillion: 1.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.65,
        tier: 'frontier',
        releaseDate: '2026-02-01',
    },
    {
        id: 'meta/llama-4-scout',
        name: 'Llama 4 Scout',
        provider: 'meta',
        contextWindow: 128_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 0.10, outputPerMillion: 0.30 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.80,
        tier: 'cheap',
        releaseDate: '2025-04-05',
    },
    {
        id: 'mistral/mistral-large-3',
        name: 'Mistral Large 3',
        provider: 'mistral',
        contextWindow: 128_000,
        maxOutputTokens: 16_384,
        pricing: { inputPerMillion: 2.50, outputPerMillion: 10.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.65,
        tier: 'frontier',
        releaseDate: '2025-10-15',
    },
    {
        id: 'mistral/mistral-medium-3',
        name: 'Mistral Medium 3',
        provider: 'mistral',
        contextWindow: 128_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 1.00, outputPerMillion: 3.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.70,
        tier: 'mid',
        releaseDate: '2025-12-01',
    },
    {
        id: 'qwen/qwen3-235b',
        name: 'Qwen3 235B',
        provider: 'qwen',
        contextWindow: 262_144,
        maxOutputTokens: 16_384,
        pricing: { inputPerMillion: 3.00, outputPerMillion: 12.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.65,
        tier: 'frontier',
        releaseDate: '2025-12-15',
    },
    {
        id: 'qwen/qwen3-32b',
        name: 'Qwen3 32B',
        provider: 'qwen',
        contextWindow: 131_072,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 0.50, outputPerMillion: 1.50 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.70,
        tier: 'mid',
        releaseDate: '2025-12-15',
    },
    {
        id: 'cohere/command-a',
        name: 'Command A',
        provider: 'cohere',
        contextWindow: 256_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 2.50, outputPerMillion: 12.50 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: true, parallelToolCalls: true },
        degradationThreshold: 0.65,
        tier: 'frontier',
        releaseDate: '2025-06-01',
    },
    {
        id: 'cohere/command-r7b',
        name: 'Command R7B',
        provider: 'cohere',
        contextWindow: 128_000,
        maxOutputTokens: 4_096,
        pricing: { inputPerMillion: 0.15, outputPerMillion: 0.60 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.75,
        tier: 'cheap',
        releaseDate: '2025-09-01',
    },
    // ── Deprecated models ──
    {
        id: 'anthropic/claude-sonnet-3.5',
        name: 'Claude Sonnet 3.5',
        provider: 'anthropic',
        contextWindow: 200_000,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 3.00, outputPerMillion: 15.00, cacheReadPerMillion: 0.30, cacheWritePerMillion: 3.75 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.65,
        tier: 'mid',
        releaseDate: '2024-06-20',
        deprecated: true,
        replacement: 'anthropic/claude-sonnet-4-20250514',
    },
    {
        id: 'openai/gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'openai',
        contextWindow: 128_000,
        maxOutputTokens: 4_096,
        pricing: { inputPerMillion: 10.00, outputPerMillion: 30.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.70,
        tier: 'mid',
        releaseDate: '2023-11-06',
        deprecated: true,
        replacement: 'openai/gpt-4o',
    },
    {
        id: 'google/gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        provider: 'google',
        contextWindow: 2_097_152,
        maxOutputTokens: 8_192,
        pricing: { inputPerMillion: 1.25, outputPerMillion: 5.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.80,
        tier: 'mid',
        releaseDate: '2024-04-09',
        deprecated: true,
        replacement: 'google/gemini-2.0-pro',
    },
    {
        id: 'anthropic/claude-opus-3',
        name: 'Claude Opus 3',
        provider: 'anthropic',
        contextWindow: 200_000,
        maxOutputTokens: 4_096,
        pricing: { inputPerMillion: 15.00, outputPerMillion: 75.00 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: false, parallelToolCalls: true },
        degradationThreshold: 0.60,
        tier: 'frontier',
        releaseDate: '2024-03-04',
        deprecated: true,
        replacement: 'anthropic/claude-opus-4',
    },
];
class ModelRegistry {
    models = new Map();
    hardcodedIds = new Set();
    cacheLoaded = false;
    cacheTimestamp = 0;
    skipCacheLoading;
    constructor(initialModels, options) {
        this.skipCacheLoading = options?.skipCacheLoading ?? false;
        const source = initialModels ?? MODELS;
        for (const entry of source) {
            this.models.set(entry.id, entry);
            this.hardcodedIds.add(entry.id);
        }
        // Auto-load cache synchronously if available (unless skipped for testing)
        if (!this.skipCacheLoading) {
            this.loadCacheSync();
        }
    }
    /**
     * Get the default cache file path (~/.chimera/model-metadata-cache.json)
     */
    getCachePath() {
        const home = (typeof process !== 'undefined' && process.env)
            ? (process.env.HOME || process.env.USERPROFILE || '')
            : '';
        const path = home ? `${home}/.chimera/model-metadata-cache.json` : '.chimera/model-metadata-cache.json';
        return path;
    }
    /**
     * Synchronously load and merge cache from disk.
     * Called automatically in constructor. Silently fails if cache is missing/expired.
     */
    loadCacheSync() {
        try {
            // Use dynamic import to avoid issues in non-Node environments
            const fs = typeof require !== 'undefined' ? require('fs') : null;
            if (!fs)
                return;
            const cachePath = this.getCachePath();
            if (!fs.existsSync(cachePath))
                return;
            const raw = fs.readFileSync(cachePath, 'utf-8');
            const cache = JSON.parse(raw);
            // Validate cache format
            if (cache.version !== 1)
                return;
            if (!Array.isArray(cache.metadata))
                return;
            // Check if cache is expired (24 hours)
            const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
            if (Date.now() - cache.timestamp > CACHE_TTL_MS)
                return;
            // Convert and merge
            const entries = this.toModelEntries(cache.metadata);
            this.mergeFetchedMetadata(entries);
            this.cacheLoaded = true;
            this.cacheTimestamp = cache.timestamp;
        }
        catch {
            // Silently fail - use hardcoded data only
        }
    }
    /**
     * Convert fetched metadata format to ModelEntry format.
     */
    toModelEntries(metadata) {
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
            degradationThreshold: 0.7,
            tier: this.inferTier(m.inputPerMillion, m.outputPerMillion, m.supportsReasoning),
            releaseDate: m.releaseDate,
            fetchedAt: m.fetchedAt,
        }));
    }
    /**
     * Infer model tier from pricing and capabilities.
     */
    inferTier(inputPerMillion, outputPerMillion, supportsReasoning) {
        if (supportsReasoning)
            return 'reasoning';
        const avgCost = (inputPerMillion + outputPerMillion) / 2;
        if (avgCost < 1)
            return 'cheap';
        if (avgCost < 10)
            return 'mid';
        return 'frontier';
    }
    get(id) {
        return this.models.get(id);
    }
    getByProvider(provider) {
        const results = [];
        for (const entry of this.models.values()) {
            if (entry.provider === provider) {
                results.push(entry);
            }
        }
        return results;
    }
    getByTier(tier) {
        const results = [];
        for (const entry of this.models.values()) {
            if (entry.tier === tier) {
                results.push(entry);
            }
        }
        return results;
    }
    search(query) {
        const lower = query.toLowerCase();
        const results = [];
        for (const entry of this.models.values()) {
            if (entry.id.toLowerCase().includes(lower) ||
                entry.name.toLowerCase().includes(lower) ||
                entry.provider.toLowerCase().includes(lower)) {
                results.push(entry);
            }
        }
        return results;
    }
    getAll() {
        return Array.from(this.models.values());
    }
    register(entry) {
        exports.ModelEntrySchema.parse(entry);
        this.models.set(entry.id, entry);
    }
    isRegistered(id) {
        return this.models.has(id);
    }
    /**
     * Merge fetched metadata into the registry.
     * - For existing models: updates contextWindow, maxOutputTokens, and pricing if the fetched data is newer
     * - For new models: adds them to the registry
     * - Preserves hardcoded models' tier and degradationThreshold unless explicitly overridden
     */
    mergeFetchedMetadata(fetchedEntries) {
        let added = 0;
        let updated = 0;
        for (const fetched of fetchedEntries) {
            const existing = this.models.get(fetched.id);
            if (existing) {
                // Update existing model with fetched data (context window, pricing, capabilities)
                const isHardcoded = this.hardcodedIds.has(fetched.id);
                this.models.set(fetched.id, {
                    ...existing,
                    // Always update these fields from API (they're more accurate)
                    contextWindow: fetched.contextWindow,
                    maxOutputTokens: fetched.maxOutputTokens,
                    pricing: fetched.pricing,
                    capabilities: fetched.capabilities,
                    // Preserve hardcoded tier and degradationThreshold for known models
                    tier: isHardcoded ? existing.tier : fetched.tier,
                    degradationThreshold: isHardcoded ? existing.degradationThreshold : fetched.degradationThreshold,
                    // Update release date if provided
                    releaseDate: fetched.releaseDate ?? existing.releaseDate,
                    // Mark as fetched from API
                    fetchedAt: fetched.fetchedAt,
                });
                updated++;
            }
            else {
                // Add new model from API
                this.models.set(fetched.id, fetched);
                added++;
            }
        }
        return { added, updated };
    }
    /**
     * Get all model IDs that were loaded from hardcoded data.
     */
    getHardcodedIds() {
        return Array.from(this.hardcodedIds);
    }
    /**
     * Check if a model was loaded from hardcoded data.
     */
    isHardcoded(id) {
        return this.hardcodedIds.has(id);
    }
    /**
     * Check if cache was loaded successfully during construction.
     */
    isCacheLoaded() {
        return this.cacheLoaded;
    }
    /**
     * Get the timestamp of when the cache was last updated.
     */
    getCacheTimestamp() {
        return this.cacheTimestamp;
    }
    /**
     * Get the total number of models in the registry (hardcoded + cached).
     */
    getModelCount() {
        return this.models.size;
    }
    /**
     * Get the number of hardcoded models.
     */
    getHardcodedCount() {
        return this.hardcodedIds.size;
    }
    /**
     * Get the number of models added from cache (non-hardcoded).
     */
    getCachedCount() {
        return this.models.size - this.hardcodedIds.size;
    }
    /**
     * Async refresh of model metadata from OpenRouter API.
     * Fetches fresh data, updates cache file, and merges into registry.
     *
     * @param config - Optional configuration for the fetcher
     * @returns Object with counts of added and updated models
     *
     * @example
     * ```typescript
     * const registry = new ModelRegistry();
     * const result = await registry.refreshFromAPI();
     * console.log(`Added ${result.added} new models, updated ${result.updated} existing`);
     * ```
     */
    async refreshFromAPI(config) {
        // Dynamic import to avoid issues in non-Node environments
        const { ModelMetadataFetcher } = await import('./model-metadata-fetcher.js');
        const fetcher = new ModelMetadataFetcher({
            openrouterApiKey: config?.openrouterApiKey,
        });
        const metadata = await fetcher.refreshMetadata();
        fetcher.saveToCache(metadata);
        const entries = this.toModelEntries(metadata);
        const result = this.mergeFetchedMetadata(entries);
        this.cacheLoaded = true;
        this.cacheTimestamp = Date.now();
        return result;
    }
    /**
     * Load cache from disk and merge into registry.
     * Useful for reloading after cache has been updated externally.
     *
     * @returns true if cache was loaded, false otherwise
     */
    reloadCache() {
        this.cacheLoaded = false;
        this.cacheTimestamp = 0;
        // We need to remove previously cached (non-hardcoded) models first
        // to avoid stale data
        const modelsToRemove = [];
        for (const [id] of this.models) {
            if (!this.hardcodedIds.has(id)) {
                modelsToRemove.push(id);
            }
        }
        for (const id of modelsToRemove) {
            this.models.delete(id);
        }
        if (!this.skipCacheLoading) {
            this.loadCacheSync();
        }
        return this.cacheLoaded;
    }
}
exports.ModelRegistry = ModelRegistry;
//# sourceMappingURL=model-registry.js.map