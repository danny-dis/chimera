// @chimera/providers — Provider abstraction layer

export { ProviderRegistry } from './provider-registry.js';
export { ProviderFactory } from './provider-factory.js';
export { ModelAdapter, ProviderConfigSchema, type ProviderConfig } from './model-adapter.js';

export {
  ModelRegistry,
  ModelEntrySchema,
  type ModelEntry,
} from './model-registry.js';

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

// Contract layer — IAgentProvider / MessageChunk / ProviderCapabilities.
// Ported from research/archon/packages/providers/src/types.ts (week-2).
// Note: the Archon-shaped `TokenUsage` is exported as `MessageTokenUsage` to
// avoid colliding with the existing `TokenUsage` interface above (different
// field shape: `input`/`output` vs. `inputTokens`/`outputTokens`).
export type {
  MessageChunk,
  MessageTokenUsage,
  ProviderCapabilities,
  SystemPromptPreset,
  SystemPromptInput,
  NativeTool,
  AgentRequestOptions,
  NodeConfig,
  SendQueryOptions,
  IAgentProvider,
} from './types/provider.js';
