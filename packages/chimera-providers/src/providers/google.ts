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
  GOOGLE_CAPABILITIES,
} from '../types/capabilities.js';
import {
  ProviderError,
  RateLimitError,
  QuotaExceededError,
  ProviderUnavailableError,
  StreamingError,
} from '../errors.js';

export interface GoogleOptions {
  pricing?: PricingInfo;
  modelInfo?: Partial<ModelInfo>;
  apiVersion?: string;
  timeoutMs?: number;
}

export interface GoogleConfig {
  apiKey: string;
  model: string;
  options?: GoogleOptions;
  projectId?: string;
}

const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_TIMEOUT_MS = 60_000;

const GOOGLE_PRICING: Record<string, PricingInfo> = {
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 10, cacheReadPerMillion: 0.31, cacheWritePerMillion: 4.5 },
  'gemini-2.5-flash': { inputPerMillion: 0.15, outputPerMillion: 0.6, cacheReadPerMillion: 0.04, cacheWritePerMillion: 1 },
  'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5 },
  'gemini-1.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.3 },
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function mapMessages(messages: Message[]): { role: string; parts: { text: string }[] }[] {
  const result: { role: string; parts: { text: string }[] }[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      result.push({
        role: 'user',
        parts: [{ text: `System: ${msg.content}` }],
      });
      result.push({
        role: 'model',
        parts: [{ text: 'Understood.' }],
      });
      continue;
    }

    if (msg.role === 'tool') {
      if (msg.toolResultId) {
        result.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: msg.toolResultId,
              response: { content: msg.content },
            },
          }] as unknown as { text: string }[],
        });
      }
      continue;
    }

    const role = msg.role === 'assistant' ? 'model' : msg.role;
    result.push({ role, parts: [{ text: msg.content }] });

    if (msg.toolCalls?.length) {
      result.push({
        role: 'model',
        parts: msg.toolCalls.map((tc) => ({
          functionCall: { name: tc.name, args: JSON.parse(tc.arguments) },
        })) as unknown as { text: string }[],
      });
    }
  }

  return result;
}

function mapTools(tools: NonNullable<CompletionOptions['tools']>) {
  return [{
    functionDeclarations: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  }];
}

function parseCompletionResult(body: Record<string, unknown>): CompletionResult {
  const candidates = body.candidates as Record<string, unknown>[] | undefined;
  if (!candidates?.length) {
    throw new ProviderError('No candidates returned from Google');
  }

  const candidate = candidates[0];
  const content = candidate.content as Record<string, unknown> | undefined;
  const parts = content?.parts as Record<string, unknown>[] | undefined;

  let textContent = '';
  const toolCalls: ToolCall[] = [];

  if (parts) {
    for (const part of parts) {
      if (part.text) {
        textContent += part.text as string;
      }
      if (part.functionCall) {
        const fc = part.functionCall as Record<string, unknown>;
        toolCalls.push({
          id: fc.name as string,
          name: fc.name as string,
          arguments: JSON.stringify(fc.args),
        });
      }
    }
  }

  const usageMetadata = body.usageMetadata as Record<string, number> | undefined;
  const tokenUsage = {
    inputTokens: usageMetadata?.promptTokenCount ?? 0,
    outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
  };

  return {
    content: textContent,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    finishReason: (candidate.finishReason as string) ?? 'STOP',
    usage: tokenUsage,
  };
}

function parseStreamChunk(data: Record<string, unknown>): StreamChunk | null {
  const candidates = data.candidates as Record<string, unknown>[] | undefined;
  if (!candidates?.length) return null;

  const candidate = candidates[0];
  const content = candidate.content as Record<string, unknown> | undefined;
  const parts = content?.parts as Record<string, unknown>[] | undefined;

  let textContent: string | undefined;
  let toolCalls: ToolCall[] | undefined;

  if (parts) {
    for (const part of parts) {
      if (part.text) {
        textContent = (textContent ?? '') + (part.text as string);
      }
      if (part.functionCall) {
        const fc = part.functionCall as Record<string, unknown>;
        toolCalls = toolCalls ?? [];
        toolCalls.push({
          id: fc.name as string,
          name: fc.name as string,
          arguments: JSON.stringify(fc.args),
        });
      }
    }
  }

  const usageMetadata = data.usageMetadata as Record<string, number> | undefined;
  const tokenUsage = usageMetadata
    ? {
        inputTokens: usageMetadata.promptTokenCount ?? 0,
        outputTokens: usageMetadata.candidatesTokenCount ?? 0,
      }
    : undefined;

  if (!textContent && !toolCalls?.length && !candidate.finishReason) {
    return null;
  }

  return {
    content: textContent,
    toolCalls,
    finishReason: (candidate.finishReason as string) ?? undefined,
    usage: tokenUsage,
  };
}

function mapError(status: number, body: unknown, model: string): never {
  const message = typeof body === 'object' && body !== null
    ? ((body as Record<string, unknown>).error as Record<string, unknown> | undefined)?.message
    : undefined;

  const errorText = (message as string) ?? `HTTP ${status}`;

  if (status === 429) {
    throw new RateLimitError(`Google rate limit: ${errorText}`, undefined, model);
  }
  if (status === 403 || status === 402) {
    throw new QuotaExceededError(`Google quota exceeded: ${errorText}`, model);
  }
  if (status >= 500) {
    throw new ProviderUnavailableError(`Google unavailable: ${errorText}`, model);
  }
  throw new ProviderError(`Google error (${status}): ${errorText}`, model, status);
}

export class GoogleProvider implements ModelProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly pricing: PricingInfo;
  private readonly modelInfo: ModelInfo;
  private readonly timeoutMs: number;

  constructor(config: GoogleConfig) {
    this.apiKey = config.apiKey;
    // Strip provider prefix (e.g., "google/gemma-4-31b-it" → "gemma-4-31b-it")
    this.model = config.model.replace(/^(google|gemini)\//, '');
    this.timeoutMs = config.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const knownPricing = GOOGLE_PRICING[config.model];
    this.pricing = config.options?.pricing ?? knownPricing ?? { inputPerMillion: 0, outputPerMillion: 0 };

    const contextWindows: Record<string, number> = {
      'gemini-2.5-pro': 1_000_000,
      'gemini-2.5-flash': 1_000_000,
      'gemini-2.0-flash': 1_000_000,
      'gemini-1.5-pro': 2_000_000,
      'gemini-1.5-flash': 1_000_000,
    };

    const maxOutputs: Record<string, number> = {
      'gemini-2.5-pro': 65_536,
      'gemini-2.5-flash': 65_536,
      'gemini-2.0-flash': 8_192,
      'gemini-1.5-pro': 8_192,
      'gemini-1.5-flash': 8_192,
    };

    this.modelInfo = {
      id: config.model,
      name: config.model,
      provider: 'google',
      contextWindow: config.options?.modelInfo?.contextWindow ?? contextWindows[config.model] ?? 1_000_000,
      maxOutputTokens: config.options?.modelInfo?.maxOutputTokens ?? maxOutputs[config.model] ?? 8_192,
      created: config.options?.modelInfo?.created ?? new Date(),
      ...config.options?.modelInfo,
    };
  }

  async complete(prompt: Message[], options?: CompletionOptions): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      contents: mapMessages(prompt),
      generationConfig: {},
    };

    const genConfig = body.generationConfig as Record<string, unknown>;
    if (options?.temperature !== undefined) genConfig.temperature = options.temperature;
    if (options?.topP !== undefined) genConfig.topP = options.topP;
    if (options?.maxTokens !== undefined) genConfig.maxOutputTokens = options.maxTokens;
    if (options?.stopSequences?.length) genConfig.stopSequences = options.stopSequences;
    if (options?.responseFormat === 'json_object') {
      genConfig.responseMimeType = 'application/json';
    }

    if (options?.tools?.length) {
      body.tools = mapTools(options.tools);
    }

    const response = await this.fetchJson(`/v1beta/models/${this.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      mapError(response.status, errorBody, this.model);
    }

    const json = (await response.json()) as Record<string, unknown>;
    return parseCompletionResult(json);
  }

  async *stream(prompt: Message[], options?: CompletionOptions): AsyncIterable<StreamChunk> {
    const body: Record<string, unknown> = {
      contents: mapMessages(prompt),
      generationConfig: {},
    };

    const genConfig = body.generationConfig as Record<string, unknown>;
    if (options?.temperature !== undefined) genConfig.temperature = options.temperature;
    if (options?.topP !== undefined) genConfig.topP = options.topP;
    if (options?.maxTokens !== undefined) genConfig.maxOutputTokens = options.maxTokens;
    if (options?.stopSequences?.length) genConfig.stopSequences = options.stopSequences;

    if (options?.tools?.length) {
      body.tools = mapTools(options.tools);
    }

    const response = await this.fetchJson(`/v1beta/models/${this.model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
          if (!trimmed.startsWith('data: ')) continue;

          const dataStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(dataStr) as Record<string, unknown>;
            const chunk = parseStreamChunk(parsed);
            if (chunk) yield chunk;
          } catch {
            // Skip malformed SSE data
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
    return { ...GOOGLE_CAPABILITIES };
  }

  supportsToolCalling(): boolean {
    return true;
  }

  supportsStructuredOutput(): boolean {
    return true;
  }

  supportsVision(): boolean {
    return true;
  }

  supportsReasoning(): boolean {
    return this.model.includes('2.5');
  }

  countTokens(text: string): number {
    return estimateTokens(text);
  }

  countTokensForMessages(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      total += estimateTokens(msg.content);
      total += 4;
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

    const url = `${GOOGLE_BASE_URL}${path}${path.includes('?') ? '&' : '?'}key=${this.apiKey}`;

    try {
      return await fetch(url, {
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
