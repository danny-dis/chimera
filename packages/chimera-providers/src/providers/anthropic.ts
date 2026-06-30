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
  ANTHROPIC_CAPABILITIES,
} from '../types/capabilities.js';
import {
  ProviderError,
  RateLimitError,
  QuotaExceededError,
  ProviderUnavailableError,
  StreamingError,
} from '../errors.js';

export interface AnthropicOptions {
  pricing?: PricingInfo;
  modelInfo?: Partial<ModelInfo>;
  apiVersion?: string;
  timeoutMs?: number;
}

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  options?: AnthropicOptions;
}

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_API_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = 60_000;

const ANTHROPIC_PRICING: Record<string, PricingInfo> = {
  'claude-sonnet-4-20250514': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  'claude-opus-4-20250514': { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5, cacheWritePerMillion: 18.75 },
  'claude-3-5-sonnet-20241022': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  'claude-3-5-haiku-20241022': { inputPerMillion: 0.8, outputPerMillion: 4, cacheReadPerMillion: 0.08, cacheWritePerMillion: 1 },
  'claude-3-opus-20240229': { inputPerMillion: 15, outputPerMillion: 75 },
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function mapMessages(messages: Message[]): { role: string; content: string | unknown[] }[] {
  const result: { role: string; content: string | unknown[] }[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      result.push({ role: 'system', content: msg.content });
      continue;
    }

    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      const contentBlocks: unknown[] = [];
      if (msg.content) {
        contentBlocks.push({ type: 'text', text: msg.content });
      }
      for (const tc of msg.toolCalls) {
        contentBlocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: JSON.parse(tc.arguments),
        });
      }
      result.push({ role: 'assistant', content: contentBlocks });
      continue;
    }

    if (msg.role === 'tool') {
      result.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.toolResultId,
            content: msg.content,
          },
        ],
      });
      continue;
    }

    result.push({ role: msg.role, content: msg.content });
  }

  return result;
}

function mapTools(tools: NonNullable<CompletionOptions['tools']>) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

function parseCompletionResult(body: Record<string, unknown>): CompletionResult {
  let content = '';
  const toolCalls: ToolCall[] = [];

  const contentBlocks = body.content as Record<string, unknown>[] | undefined;
  if (contentBlocks) {
    for (const block of contentBlocks) {
      if (block.type === 'text') {
        content += block.text as string;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id as string,
          name: block.name as string,
          arguments: JSON.stringify(block.input),
        });
      }
    }
  }

  const usage = body.usage as Record<string, number> | undefined;
  const tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  } = {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
  };
  // Anthropic reports prompt-cache usage as separate counters on `usage`.
  // `cache_creation_input_tokens` is cache-write; `cache_read_input_tokens`
  // is cache-read. Both can coexist in a single response. Only attach
  // them when present so mock/test bodies without them stay clean.
  if (usage?.cache_read_input_tokens !== undefined) {
    tokenUsage.cacheReadTokens = usage.cache_read_input_tokens;
  }
  if (usage?.cache_creation_input_tokens !== undefined) {
    tokenUsage.cacheWriteTokens = usage.cache_creation_input_tokens;
  }

  return {
    content,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    finishReason: (body.stop_reason as string) ?? 'end_turn',
    usage: tokenUsage,
  };
}

function parseStreamChunk(
  data: Record<string, unknown>,
  type: string,
): StreamChunk | null {
  if (type === 'content_block_delta') {
    const delta = data.delta as Record<string, unknown> | undefined;
    if (delta?.type === 'text_delta') {
      return { content: delta.text as string };
    }
    if (delta?.type === 'input_json_delta') {
      return { toolCalls: [{ id: '', name: '', arguments: (delta.partial_json as string) ?? '' }] };
    }
  }

  if (type === 'message_delta') {
    const delta = data.delta as Record<string, unknown> | undefined;
    const usage = data.usage as Record<string, number> | undefined;
    if (usage) {
      const tokenUsage: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
      } = {
        inputTokens: 0,
        outputTokens: usage.output_tokens ?? 0,
      };
      // Same Anthropic cache-token field names as parseCompletionResult.
      if (usage.cache_read_input_tokens !== undefined) {
        tokenUsage.cacheReadTokens = usage.cache_read_input_tokens;
      }
      if (usage.cache_creation_input_tokens !== undefined) {
        tokenUsage.cacheWriteTokens = usage.cache_creation_input_tokens;
      }
      return {
        finishReason: (delta?.stop_reason as string) ?? undefined,
        usage: tokenUsage,
      };
    }
    return {
      finishReason: (delta?.stop_reason as string) ?? undefined,
    };
  }

  return null;
}

function mapError(status: number, body: unknown, model: string): never {
  const message = typeof body === 'object' && body !== null
    ? ((body as Record<string, unknown>).error as Record<string, unknown> | undefined)?.message
    : undefined;

  const errorText = (message as string) ?? `HTTP ${status}`;

  if (status === 429) {
    throw new RateLimitError(`Anthropic rate limit: ${errorText}`, undefined, model);
  }
  if (status === 402) {
    throw new QuotaExceededError(`Anthropic quota exceeded: ${errorText}`, model);
  }
  if (status >= 500) {
    throw new ProviderUnavailableError(`Anthropic unavailable: ${errorText}`, model);
  }
  throw new ProviderError(`Anthropic error (${status}): ${errorText}`, model, status);
}

export class AnthropicProvider implements ModelProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly pricing: PricingInfo;
  private readonly modelInfo: ModelInfo;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.apiVersion = config.options?.apiVersion ?? ANTHROPIC_API_VERSION;
    this.timeoutMs = config.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const knownPricing = ANTHROPIC_PRICING[config.model];
    this.pricing = config.options?.pricing ?? knownPricing ?? { inputPerMillion: 0, outputPerMillion: 0 };

    const contextWindows: Record<string, number> = {
      'claude-sonnet-4-20250514': 200_000,
      'claude-opus-4-20250514': 200_000,
      'claude-3-5-sonnet-20241022': 200_000,
      'claude-3-5-haiku-20241022': 200_000,
      'claude-3-opus-20240229': 200_000,
    };

    const maxOutputs: Record<string, number> = {
      'claude-sonnet-4-20250514': 8_192,
      'claude-opus-4-20250514': 8_192,
      'claude-3-5-sonnet-20241022': 8_192,
      'claude-3-5-haiku-20241022': 8_192,
      'claude-3-opus-20240229': 4_096,
    };

    this.modelInfo = {
      id: config.model,
      name: config.model,
      provider: 'anthropic',
      contextWindow: config.options?.modelInfo?.contextWindow ?? contextWindows[config.model] ?? 200_000,
      maxOutputTokens: config.options?.modelInfo?.maxOutputTokens ?? maxOutputs[config.model] ?? 8_192,
      created: config.options?.modelInfo?.created ?? new Date(),
      ...config.options?.modelInfo,
    };
  }

  async complete(prompt: Message[], options?: CompletionOptions): Promise<CompletionResult> {
    const systemMessage = prompt.find((m) => m.role === 'system');
    const nonSystemMessages = prompt.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: this.model,
      messages: mapMessages(nonSystemMessages),
      max_tokens: options?.maxTokens ?? this.modelInfo.maxOutputTokens,
    };

    if (systemMessage) {
      // When cacheControl is set, convert the system field to an array of
      // content blocks and place the cache_control marker on the LAST
      // block — Anthropic only honors the marker on the final system
      // block of the request.
      if (options?.cacheControl) {
        body.system = [
          {
            type: 'text',
            text: systemMessage.content,
            cache_control: {
              type: options.cacheControl.type,
              ttl: options.cacheControl.ttl ?? '5m',
            },
          },
        ];
      } else {
        body.system = systemMessage.content;
      }
    }
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.topP !== undefined) body.top_p = options.topP;
    if (options?.stopSequences?.length) body.stop_sequences = options.stopSequences;
    if (options?.tools?.length) body.tools = mapTools(options.tools);
    if (options?.toolChoice) {
      body.tool_choice = options.toolChoice === 'required'
        ? { type: 'any' }
        : options.toolChoice === 'none'
          ? { type: 'auto' }
          : { type: 'auto' };
    }

    const response = await this.fetch('/v1/messages', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      mapError(response.status, errorBody, this.model);
    }

    const json = (await response.json()) as Record<string, unknown>;
    const result = parseCompletionResult(json);
    if (!result.content && (!result.toolCalls || result.toolCalls.length === 0)) {
      throw new ProviderError(
        `Model "${this.model}" returned empty content with no tool calls. This may indicate a content filter, rate limit, or provider issue.`,
        this.model,
      );
    }
    return { ...result, rawContent: result.content };
  }

  async *stream(prompt: Message[], options?: CompletionOptions): AsyncIterable<StreamChunk> {
    const systemMessage = prompt.find((m) => m.role === 'system');
    const nonSystemMessages = prompt.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: this.model,
      messages: mapMessages(nonSystemMessages),
      max_tokens: options?.maxTokens ?? this.modelInfo.maxOutputTokens,
      stream: true,
    };

    if (systemMessage) {
      // Mirror complete(): when cacheControl is set, send system as an
      // array with cache_control on the LAST block (Anthropic requirement).
      if (options?.cacheControl) {
        body.system = [
          {
            type: 'text',
            text: systemMessage.content,
            cache_control: {
              type: options.cacheControl.type,
              ttl: options.cacheControl.ttl ?? '5m',
            },
          },
        ];
      } else {
        body.system = systemMessage.content;
      }
    }
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.topP !== undefined) body.top_p = options.topP;
    if (options?.stopSequences?.length) body.stop_sequences = options.stopSequences;
    if (options?.tools?.length) body.tools = mapTools(options.tools);

    const response = await this.fetch('/v1/messages', {
      method: 'POST',
      headers: { ...this.getHeaders(), Accept: 'text/event-stream' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      mapError(response.status, errorBody, this.model);
    }

    if (!response.body) {
      throw new StreamingError('Response body is null', this.model);
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
          if (!trimmed.startsWith('event: ') && !trimmed.startsWith('data: ')) continue;

          if (trimmed.startsWith('event: ')) {
            const eventType = trimmed.slice(7);
            const dataLine = lines.shift()?.trim();
            if (!dataLine?.startsWith('data: ')) continue;

            const dataStr = dataLine.slice(6);
            if (dataStr === '[DONE]') return;

            try {
              const parsed = JSON.parse(dataStr) as Record<string, unknown>;
              const chunk = parseStreamChunk(parsed, eventType);
              if (chunk) yield chunk;
            } catch {
              // Skip malformed SSE data
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new StreamingError(
        error instanceof Error ? error.message : 'Stream read failed',
        this.model,
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
    return { ...ANTHROPIC_CAPABILITIES };
  }

  supportsToolCalling(): boolean {
    return true;
  }

  supportsStructuredOutput(): boolean {
    return true;
  }

  supportsVision(): boolean {
    return this.model.includes('sonnet') || this.model.includes('opus');
  }

  supportsReasoning(): boolean {
    return false;
  }

  countTokens(text: string): number {
    return estimateTokens(text);
  }

  countTokensForMessages(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      total += estimateTokens(msg.content);
      total += 3;
      if (msg.toolCalls?.length) {
        for (const tc of msg.toolCalls) {
          total += estimateTokens(tc.name + tc.arguments);
        }
      }
    }
    return total;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': this.apiVersion,
    };
  }

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(`${ANTHROPIC_BASE_URL}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ProviderUnavailableError('Request timed out', this.model);
      }
      throw new ProviderUnavailableError(
        error instanceof Error ? error.message : 'Network request failed',
        this.model,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
