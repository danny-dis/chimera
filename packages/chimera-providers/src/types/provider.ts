export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResultId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ResponseFormat = 'text' | 'json_object';

/**
 * Optional prompt-cache directive. Anthropic uses this to attach a
 * `cache_control` marker to a system content block so the prefix can be
 * cached for `ttl` minutes. OpenAI auto-caches prompts and ignores this
 * field; the type is shared so callers can pass it uniformly.
 */
export interface CacheControlOptions {
  type: 'ephemeral';
  ttl?: '5m' | '1h';
}

export interface CompletionOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stopSequences?: string[];
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'required' | 'none' | { type: 'function'; name: string };
  responseFormat?: ResponseFormat;
  cacheControl?: CacheControlOptions;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface CompletionResult {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: string;
  usage: TokenUsage;
}

export interface StreamChunk {
  content?: string;
  toolCalls?: ToolCall[];
  finishReason?: string;
  usage?: TokenUsage;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutputTokens: number;
  created?: Date;
}

export interface PricingInfo {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}

export interface ModelProvider {
  complete(prompt: Message[], options?: CompletionOptions): Promise<CompletionResult>;
  stream(prompt: Message[], options?: CompletionOptions): AsyncIterable<StreamChunk>;

  getModel(): ModelInfo;
  getContextWindow(): number;
  getMaxOutputTokens(): number;

  getCost(tokens: { input: number; output: number }): number;
  getPricing(): PricingInfo;

  /**
   * Returns the full capabilities object for this provider.
   * Prefer this over individual supports* methods for new code.
   */
  getCapabilities(): import('./capabilities.js').ProviderCapabilities;

  supportsToolCalling(): boolean;
  supportsStructuredOutput(): boolean;
  supportsVision(): boolean;
  supportsReasoning(): boolean;

  countTokens(text: string): number;
  countTokensForMessages(messages: Message[]): number;
}
