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

const DEFAULT_TIMEOUT_MS = 60_000;

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

  const usage = body.usage as Record<string, number> | undefined;
  const tokenUsage = {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };

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

  const usage = data.usage as Record<string, number> | undefined;
  const tokenUsage = usage
    ? {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
      }
    : undefined;

  if (!content && !toolCalls?.length && !finishReason) {
    return null;
  }

  return { content, toolCalls, finishReason, usage: tokenUsage };
}

function mapError(status: number, body: unknown, provider: string): never {
  const message = typeof body === 'object' && body !== null
    ? ((body as Record<string, unknown>).error as Record<string, unknown>)?.message
    : undefined;

  const errorText = (message as string) ?? `HTTP ${status}`;

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

  constructor(config: OpenAICompatibleConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
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
  }

  async complete(prompt: Message[], options?: CompletionOptions): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: mapMessages(prompt),
      stream: false,
    };

    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.topP !== undefined) body.top_p = options.topP;
    if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options?.stopSequences?.length) body.stop = options.stopSequences;
    if (options?.tools?.length) body.tools = mapTools(options.tools);
    if (options?.toolChoice) body.tool_choice = mapToolChoice(options.toolChoice);
    if (options?.responseFormat) {
      body.response_format = { type: options.responseFormat };
    }

    const response = await this.fetchJson('/v1/chat/completions', {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      mapError(response.status, errorBody, this.modelInfo.provider);
    }

    const json = (await response.json()) as Record<string, unknown>;
    return parseCompletionResult(json);
  }

  async *stream(prompt: Message[], options?: CompletionOptions): AsyncIterable<StreamChunk> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: mapMessages(prompt),
      stream: true,
      stream_options: { include_usage: true },
    };

    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.topP !== undefined) body.top_p = options.topP;
    if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options?.stopSequences?.length) body.stop = options.stopSequences;
    if (options?.tools?.length) body.tools = mapTools(options.tools);
    if (options?.toolChoice) body.tool_choice = mapToolChoice(options.toolChoice);
    if (options?.responseFormat) {
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
