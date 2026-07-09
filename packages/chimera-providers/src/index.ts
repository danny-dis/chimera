// @chimera/providers — Provider abstraction layer

export { ProviderRegistry } from './provider-registry.js';
export { ProviderFactory, listModels, getDefaultRegistry, resetDefaultRegistry } from './provider-factory.js';
export { ModelAdapter, ProviderConfigSchema, type ProviderConfig } from './model-adapter.js';

export {
  ModelRegistry,
  ModelEntrySchema,
  type ModelEntry,
} from './model-registry.js';

export {
  recommendRoleModels,
  recommendFromProviders,
  rankByTier,
  type RoleModels,
  type ConfigProviderRole,
} from './recommend.js';

export {
  ModelMetadataFetcher,
  fetchAndCacheModelMetadata,
  getModelEntriesFromAPI,
  type FetchedModelMetadata,
  type CacheEntry,
  type FetcherConfig,
} from './model-metadata-fetcher.js';

export {
  MetadataAwareProviderFactory,
  createMetadataAwareFactory,
  createProviderWithDynamicMetadata,
  type MetadataAwareFactoryConfig,
} from './metadata-aware-factory.js';

export {
  CostCalculator,
  type CostBreakdown,
} from './cost-calculator.js';

export {
  ProviderCostTracker,
  type CostSession,
} from './cost-tracker-provider.js';

export {
  BudgetEnforcer,
  type BudgetConfig,
  type BudgetAction,
  type BudgetCheckResult,
} from './budget-enforcer.js';

export {
  RateLimiter,
} from './rate-limiter.js';

export {
  CostProjectionEngine,
  type CostProjection,
} from './cost-projection.js';

export {
  ModelComparator,
  type ModelComparison,
} from './model-comparator.js';

export {
  ProviderError,
  RateLimitError,
  QuotaExceededError,
  ProviderUnavailableError,
  InvalidConfigError,
  StreamingError,
} from './errors.js';

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
