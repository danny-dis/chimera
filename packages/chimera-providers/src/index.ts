// @chimera/providers — Provider abstraction layer

export {
  ModelEntrySchema,
  SimpleModelRegistry,
  recommendFromProviders,
  type ModelEntry,
  type ModelRegistry,
} from './model-entry.js';

export { ProviderRegistry } from './provider-registry.js';
export { ProviderFactory, listModels } from './provider-factory.js';
export { ModelAdapter, ProviderConfigSchema, type ProviderConfig } from './model-adapter.js';
export { RateLimiter } from './rate-limiter.js';

// DMR-X backend routing — auto-map roles to DMR-X meta-models
export {
  DMRX_PRESETS,
  ROLE_TO_DMRX_PRESET,
  applyDmrxRouting,
  isDmrxBackend,
  isDmrxPreset,
  type DmrxPreset,
  type ChimeraMode,
} from './dmrx-routing.js';

export {
  ProviderError,
  RateLimitError,
  QuotaExceededError,
  ProviderUnavailableError,
  InvalidConfigError,
  StreamingError,
} from './errors.js';

// Retry-with-backoff wrapper for transient provider errors (rate-limit, 503)
export { withRetry, type RetryOptions } from './retry.js';

// Offline mock — used when no real provider is configured (CI, dev, first-run)
export { MockProvider, createDefaultMockProvider } from './providers/mock.js';
export type { MockProviderOptions } from './providers/mock.js';

// OpenAI-compatible provider (base for OpenRouter, etc.)
export { OpenAICompatibleProvider } from './providers/openai-compatible.js';
export type { OpenAICompatibleConfig, OpenAICompatibleOptions } from './providers/openai-compatible.js';

// OpenRouter — routes to 200+ models via single API key
export { OpenRouterProvider } from './providers/openrouter.js';
export type { OpenRouterConfig, OpenRouterOptions } from './providers/openrouter.js';

export type {
  ToolCall,
  Message,
  ToolDefinition,
  ResponseFormat,
  CompletionOptions,
  TokenUsage,
  CompletionResult,
  StreamChunk,
  ModelInfo,
  PricingInfo,
  ModelProvider,
} from './types/provider.js';

export {
  ProviderCapabilitiesSchema,
  StructuredOutputLevel,
  DEFAULT_CAPABILITIES,
  ANTHROPIC_CAPABILITIES,
  OPENAI_CAPABILITIES,
  OPENROUTER_CAPABILITIES,
  OLLAMA_CAPABILITIES,
  GOOGLE_CAPABILITIES,
} from './types/capabilities.js';

export type {
  ProviderCapabilities,
} from './types/capabilities.js';

// Fallback chain — automatic provider failover on rate limits / errors
export { FallbackChain } from './fallback-chain.js';
export type { FallbackEvent, FallbackEventListener } from './fallback-chain.js';
