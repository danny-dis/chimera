import {
  Message,
  ToolCall,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  ModelInfo,
  PricingInfo,
  ModelProvider,
} from '../types/provider.js';
import {
  ProviderCapabilities,
  DEFAULT_CAPABILITIES,
} from '../types/capabilities.js';
import {
  ProviderError,
  RateLimitError,
  QuotaExceededError,
  ProviderUnavailableError,
  StreamingError,
} from '../errors.js';

export interface OpenAICompatibleOptions {
  pricing?: PricingInfo;
  modelInfo?: Partial<ModelInfo>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Whether the upstream provider supports response_format: json_object. Defaults to true for OpenAI, false for others. */
  supportsResponseFormat?: boolean;
}

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  options?: OpenAICompatibleOptions;
}

const DEFAULT_PRICING: PricingInfo = {
  inputPerMillion: 0,
  outputPerMillion: 0,
};

const DEFAULT_TIMEOUT_MS = 120_000;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function mapMessages(messages: Message[]): { role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }[] {
  return messages.map((msg) => {
    const base = { role: msg.role, content: msg.content };
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      return {
        ...base,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    if (msg.role === 'tool') {
      return { ...base, tool_call_id: msg.toolResultId };
    }
    return base;
  });
}

function mapTools(tools: NonNullable<CompletionOptions['tools']>) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function mapToolChoice(choice: NonNullable<CompletionOptions['toolChoice']>) {
  if (choice === 'auto' || choice === 'required' || choice === 'none') {
    return choice;
  }
  return { type: 'function' as const, function: { name: choice.name } };
}

function parseCompletionResult(body: Record<string, unknown>): CompletionResult {
  const choice = (body.choices as Record<string, unknown>[])?.[0];
  if (!choice) {
    throw new ProviderError('No choices returned from provider');
  }

  const message = choice.message as Record<string, unknown> | undefined;
  const content = (message?.content as string) ?? '';

  let toolCalls: ToolCall[] | undefined;
  const rawToolCalls = message?.tool_calls as Record<string, unknown>[] | undefined;
  if (rawToolCalls?.length) {
    toolCalls = rawToolCalls.map((tc) => {
      const fn = tc.function as Record<string, unknown>;
      return {
        id: tc.id as string,
        name: fn.name as string,
        arguments: fn.arguments as string,
      };
    });
  }

  const usage = body.usage as Record<string, unknown> | undefined;
  const tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  } = {
    inputTokens: (usage?.prompt_tokens as number) ?? 0,
    outputTokens: (usage?.completion_tokens as number) ?? 0,
  };
  // OpenAI returns cached-input tokens nested under
  // `usage.prompt_tokens_details.cached_tokens`. We only attach the
  // cache field when the nested object is present so non-OpenAI
  // OpenAI-compatible endpoints (which omit it) stay clean.
  const promptDetails = usage?.prompt_tokens_details as Record<string, number> | undefined;
  if (promptDetails?.cached_tokens !== undefined) {
    tokenUsage.cacheReadTokens = promptDetails.cached_tokens;
  }

  return {
    content,
    toolCalls,
    finishReason: (choice.finish_reason as string) ?? 'stop',
    usage: tokenUsage,
  };
}

function parseStreamChunk(
  data: Record<string, unknown>,
): StreamChunk | null {
  const choice = (data.choices as Record<string, unknown>[])?.[0];
  if (!choice) return null;

  const delta = choice.delta as Record<string, unknown> | undefined;
  const content = (delta?.content as string) ?? undefined;

  let toolCalls: ToolCall[] | undefined;
  const rawToolCalls = delta?.tool_calls as Record<string, unknown>[] | undefined;
  if (rawToolCalls?.length) {
    toolCalls = rawToolCalls.map((tc) => {
      const fn = tc.function as Record<string, unknown>;
      return {
        id: (tc.index === 0 ? tc.id : undefined) as string,
        name: (fn?.name as string) ?? '',
        arguments: (fn?.arguments as string) ?? '',
      };
    });
  }

  const finishReason = (choice.finish_reason as string) ?? undefined;

  const usage = data.usage as Record<string, unknown> | undefined;
  let tokenUsage:
    | {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
      }
    | undefined;
  if (usage) {
    tokenUsage = {
      inputTokens: (usage.prompt_tokens as number) ?? 0,
      outputTokens: (usage.completion_tokens as number) ?? 0,
    };
    // Same nested `prompt_tokens_details.cached_tokens` shape as
    // parseCompletionResult; the `stream_options: { include_usage: true }`
    // request in `stream()` is what populates this object.
    const promptDetails = usage.prompt_tokens_details as Record<string, number> | undefined;
    if (promptDetails?.cached_tokens !== undefined) {
      tokenUsage.cacheReadTokens = promptDetails.cached_tokens;
    }
  }

  if (!content && !toolCalls?.length && !finishReason) {
    return null;
  }

  return { content, toolCalls, finishReason, usage: tokenUsage };
}

function mapError(status: number, body: unknown, provider: string): never {
  let message: string | undefined;
  if (typeof body === 'object' && body !== null) {
    const obj = body as Record<string, unknown>;
    // Standard format: { error: { message: "..." } }
    if (obj.error && typeof obj.error === 'object') {
      message = (obj.error as Record<string, unknown>).message as string | undefined;
    }
    // Array format: [{ error: { message: "..." } }]
    if (!message && Array.isArray(body) && body.length > 0) {
      const first = body[0] as Record<string, unknown>;
      if (first?.error && typeof first.error === 'object') {
        message = (first.error as Record<string, unknown>).message as string | undefined;
      }
    }
  }

  const errorText = message ?? `HTTP ${status}`;

  if (status === 429) {
    throw new RateLimitError(`Rate limit exceeded: ${errorText}`, undefined, provider);
  }
  if (status === 402 || status === 403) {
    throw new QuotaExceededError(`Quota exceeded: ${errorText}`, provider);
  }
  if (status >= 500) {
    throw new ProviderUnavailableError(`Provider unavailable: ${errorText}`, provider);
  }
  throw new ProviderError(`Provider error (${status}): ${errorText}`, provider, status);
}

export class OpenAICompatibleProvider implements ModelProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly pricing: PricingInfo;
  private readonly modelInfo: ModelInfo;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly supportsResponseFormat: boolean;

  constructor(config: OpenAICompatibleConfig) {
    // Strip a trailing slash AND a trailing "/v1" if present. Chimera always
    // appends "/v1/chat/completions" itself, so a config base_url of
    // "https://openrouter.ai/api/v1" would otherwise 404.
    this.baseUrl = config.baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.pricing = config.options?.pricing ?? DEFAULT_PRICING;
    this.timeoutMs = config.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const now = new Date();
    this.modelInfo = {
      id: config.model,
      name: config.model,
      provider: new URL(config.baseUrl).hostname,
      contextWindow: config.options?.modelInfo?.contextWindow ?? 128_000,
      maxOutputTokens: config.options?.modelInfo?.maxOutputTokens ?? 4_096,
      created: config.options?.modelInfo?.created ?? now,
      ...config.options?.modelInfo,
    };

    this.headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      ...config.options?.headers,
    };

    // Detect response_format support: most OpenAI-compatible providers support it.
    // Default to true; providers that don't support it can set supportsResponseFormat: false.
    if (config.options?.supportsResponseFormat !== undefined) {
      this.supportsResponseFormat = config.options.supportsResponseFormat;
    } else {
      this.supportsResponseFormat = true;
    }
  }

  async complete(prompt: Message[], options?: CompletionOptions): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: mapMessages(prompt),
      stream: false,
    };

    // NOTE: `options.cacheControl` is intentionally a no-op for
    // OpenAI-compatible providers. OpenAI automatically caches prompts
    // (prefix caching on matching chat.completions requests), so no
    // explicit marker is required. The field is accepted on the shared
    // CompletionOptions interface so callers can pass it uniformly
    // without branching on provider.
    void options?.cacheControl;

    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.topP !== undefined) body.top_p = options.topP;
    if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options?.stopSequences?.length) body.stop = options.stopSequences;
    if (options?.tools?.length) body.tools = mapTools(options.tools);
    if (options?.toolChoice) body.tool_choice = mapToolChoice(options.toolChoice);
    if (options?.responseFormat && this.supportsResponseFormat) {
      body.response_format = { type: options.responseFormat };
    }

    const response = await this.fetchJson('/v1/chat/completions', {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    // Some OpenAI-compatible gateways (e.g. OpenGateway's tencent/hy3 free
    // route) reject `response_format: {type:"json_object"}` with a 400, even
    // though they handle tools and normal chat fine. Rather than fail the
    // whole task, transparently retry once without response_format. This
    // keeps structured-output requests working on providers that support it
    // and gracefully degrades on those that don't — no config change needed.
    if (!response.ok && response.status === 400 && body.response_format) {
      const retryBody: Record<string, unknown> = { ...body };
      delete retryBody.response_format;
      const retryResponse = await this.fetchJson('/v1/chat/completions', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(retryBody),
      });
      if (retryResponse.ok) {
        const json = (await retryResponse.json()) as Record<string, unknown>;
        const result = parseCompletionResult(json);
        if (!result.content && (!result.toolCalls || result.toolCalls.length === 0)) {
          throw new ProviderError(
            `Model "${this.model}" returned empty content with no tool calls. This may indicate a content filter, rate limit, or provider issue.`,
            this.modelInfo.provider,
          );
        }
        return { ...result, rawContent: result.content };
      }
      // Retry also failed — surface the original 400 error.
      const errorBody = await response.json().catch(() => null);
      mapError(response.status, errorBody, this.modelInfo.provider);
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      mapError(response.status, errorBody, this.modelInfo.provider);
    }

    const json = (await response.json()) as Record<string, unknown>;
    const result = parseCompletionResult(json);
    if (!result.content && (!result.toolCalls || result.toolCalls.length === 0)) {
      throw new ProviderError(
        `Model "${this.model}" returned empty content with no tool calls. This may indicate a content filter, rate limit, or provider issue.`,
        this.modelInfo.provider,
      );
    }
    return { ...result, rawContent: result.content };
  }

  async *stream(prompt: Message[], options?: CompletionOptions): AsyncIterable<StreamChunk> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: mapMessages(prompt),
      stream: true,
      stream_options: { include_usage: true },
    };

    // NOTE: `options.cacheControl` is intentionally a no-op for
    // OpenAI-compatible providers. OpenAI automatically caches prompts
    // (prefix caching on matching chat.completions requests), so no
    // explicit marker is required. The field is accepted on the shared
    // CompletionOptions interface so callers can pass it uniformly
    // without branching on provider.
    void options?.cacheControl;

    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.topP !== undefined) body.top_p = options.topP;
    if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options?.stopSequences?.length) body.stop = options.stopSequences;
    if (options?.tools?.length) body.tools = mapTools(options.tools);
    if (options?.toolChoice) body.tool_choice = mapToolChoice(options.toolChoice);
    if (options?.responseFormat && this.supportsResponseFormat) {
      body.response_format = { type: options.responseFormat };
    }

    const response = await this.fetchStream('/v1/chat/completions', {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      mapError(response.status, errorBody, this.modelInfo.provider);
    }

    if (!response.body) {
      throw new StreamingError('Response body is null', this.modelInfo.provider);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            const chunk = parseStreamChunk(parsed);
            if (chunk) yield chunk;
          } catch {
            // Skip malformed SSE data lines
          }
        }
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new StreamingError(
        error instanceof Error ? error.message : 'Stream read failed',
        this.modelInfo.provider,
      );
    } finally {
      reader.releaseLock();
    }
  }

  getModel(): ModelInfo {
    return { ...this.modelInfo };
  }

  getContextWindow(): number {
    return this.modelInfo.contextWindow;
  }

  getMaxOutputTokens(): number {
    return this.modelInfo.maxOutputTokens;
  }

  getCost(tokens: { input: number; output: number }): number {
    const inputCost = (tokens.input / 1_000_000) * this.pricing.inputPerMillion;
    const outputCost = (tokens.output / 1_000_000) * this.pricing.outputPerMillion;
    return inputCost + outputCost;
  }

  getPricing(): PricingInfo {
    return { ...this.pricing };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      ...DEFAULT_CAPABILITIES,
      functionCalling: true,
      structuredOutput: 'best-effort',
    };
  }

  supportsToolCalling(): boolean {
    return true;
  }

  supportsStructuredOutput(): boolean {
    return true;
  }

  supportsVision(): boolean {
    return this.modelInfo.id.includes('vision') || this.modelInfo.id.includes('4o');
  }

  supportsReasoning(): boolean {
    return this.modelInfo.id.includes('o1') || this.modelInfo.id.includes('o3');
  }

  countTokens(text: string): number {
    return estimateTokens(text);
  }

  countTokensForMessages(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      total += estimateTokens(msg.content);
      total += 4; // per-message overhead
      if (msg.toolCalls?.length) {
        for (const tc of msg.toolCalls) {
          total += estimateTokens(tc.name + tc.arguments);
        }
      }
    }
    return total;
  }

  private async fetchJson(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ProviderUnavailableError('Request timed out', this.modelInfo.provider);
      }
      throw new ProviderUnavailableError(
        error instanceof Error ? error.message : 'Network request failed',
        this.modelInfo.provider,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchStream(path: string, init: RequestInit): Promise<Response> {
    return this.fetchJson(path, init);
  }
}
