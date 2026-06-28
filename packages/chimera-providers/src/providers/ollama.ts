import {
  Message,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  ModelInfo,
  PricingInfo,
  ModelProvider,
} from '../types/provider.js';
import {
  ProviderCapabilities,
  OLLAMA_CAPABILITIES,
} from '../types/capabilities.js';
import {
  ProviderError,
  ProviderUnavailableError,
  StreamingError,
} from '../errors.js';

export interface OllamaOptions {
  modelInfo?: Partial<ModelInfo>;
  timeoutMs?: number;
}

export interface OllamaConfig {
  baseUrl?: string;
  model: string;
  options?: OllamaOptions;
}

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 120_000;
const FREE_PRICING: PricingInfo = { inputPerMillion: 0, outputPerMillion: 0 };

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function mapMessages(messages: Message[]): { role: string; content: string }[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

function parseCompletionResult(body: Record<string, unknown>): CompletionResult {
  const content = (body.message as Record<string, unknown>)?.content as string | undefined;
  const totalTokens = body.eval_count as number | undefined;
  const promptTokens = body.prompt_eval_count as number | undefined;

  const outputTokens = totalTokens ?? 0;
  const inputTokens = promptTokens ?? 0;

  return {
    content: content ?? '',
    finishReason: (body.done as boolean) === true ? 'stop' : 'unknown',
    usage: { inputTokens, outputTokens },
  };
}

function parseStreamChunk(data: Record<string, unknown>): StreamChunk | null {
  const content = (data.message as Record<string, unknown>)?.content as string | undefined;
  const done = data.done as boolean | undefined;

  if (!content && !done) return null;

  const outputTokens = data.eval_count as number | undefined;
  const promptTokens = data.prompt_eval_count as number | undefined;

  return {
    content,
    finishReason: done === true ? 'stop' : undefined,
    usage: outputTokens !== undefined || promptTokens !== undefined
      ? {
          inputTokens: promptTokens ?? 0,
          outputTokens: outputTokens ?? 0,
        }
      : undefined,
  };
}

export class OllamaProvider implements ModelProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly modelInfo: ModelInfo;
  private readonly timeoutMs: number;

  constructor(config: OllamaConfig) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.model = config.model;
    this.timeoutMs = config.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    this.modelInfo = {
      id: config.model,
      name: config.model,
      provider: 'ollama',
      contextWindow: config.options?.modelInfo?.contextWindow ?? 8_192,
      maxOutputTokens: config.options?.modelInfo?.maxOutputTokens ?? 2_048,
      created: config.options?.modelInfo?.created ?? new Date(),
      ...config.options?.modelInfo,
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

    const response = await this.fetchJson('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new ProviderError(
        `Ollama error (${response.status}): ${response.statusText}`,
        this.model,
        response.status,
      );
    }

    const json = (await response.json()) as Record<string, unknown>;
    return parseCompletionResult(json);
  }

  async *stream(prompt: Message[], options?: CompletionOptions): AsyncIterable<StreamChunk> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: mapMessages(prompt),
      stream: true,
    };

    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.topP !== undefined) body.top_p = options.topP;
    if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options?.stopSequences?.length) body.stop = options.stopSequences;

    const response = await this.fetchJson('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new ProviderError(
        `Ollama error (${response.status}): ${response.statusText}`,
        this.model,
        response.status,
      );
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
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            const chunk = parseStreamChunk(parsed);
            if (chunk) yield chunk;
          } catch {
            // Skip malformed NDJSON lines
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

  getCost(_tokens: { input: number; output: number }): number {
    return 0;
  }

  getPricing(): PricingInfo {
    return { ...FREE_PRICING };
  }

  getCapabilities(): ProviderCapabilities {
    return { ...OLLAMA_CAPABILITIES };
  }

  supportsToolCalling(): boolean {
    return false;
  }

  supportsStructuredOutput(): boolean {
    return false;
  }

  supportsVision(): boolean {
    return this.model.includes('llava') || this.model.includes('vision');
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
      total += 4;
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
