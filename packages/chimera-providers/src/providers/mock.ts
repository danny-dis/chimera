import {
  Message,
  ToolCall,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  ModelInfo,
  PricingInfo,
  ModelProvider,
  TokenUsage,
} from '../types/provider.js';
import {
  ProviderCapabilities,
  DEFAULT_CAPABILITIES,
} from '../types/capabilities.js';

export interface MockProviderOptions {
  /** Model id to advertise. Default: 'mock-default'. */
  model?: string;
  /** Display name. Default: 'Mock Provider'. */
  name?: string;
  /** Provider slug. Default: 'mock'. */
  provider?: string;
  /** Context window size. Default: 200_000. */
  contextWindow?: number;
  /** Max output tokens. Default: 8_192. */
  maxOutputTokens?: number;
  /** Pricing in USD per million tokens. Default: 0 (free). */
  pricing?: PricingInfo;
  /** Static response content. Default: a friendly echo. */
  response?: string | ((messages: Message[]) => string);
  /** Static tool calls (returned alongside the response). */
  toolCalls?: ToolCall[];
  /** Latency simulation in ms. Default: 0 (instant). */
  latencyMs?: number;
  /** Optional failure injection. */
  failOnCall?: number;
  /** Emit a stream of chunks instead of a single response. Default: true. */
  streamChunks?: boolean;
}

/**
 * A deterministic, offline ModelProvider used as a default when no real
 * API keys are configured. Useful for:
 *
 *   - CI smoke tests
 *   - Local "try it" runs
 *   - Development without burning API credits
 *
 * The MockProvider is intentionally side-effect-free: it does not call the
 * network, does not require any credentials, and produces predictable outputs
 * based on the input messages.
 */
export class MockProvider implements ModelProvider {
  private readonly options: Required<Omit<MockProviderOptions, 'response' | 'toolCalls' | 'failOnCall' | 'pricing'>> & {
    response: string | ((messages: Message[]) => string);
    toolCalls?: ToolCall[];
    failOnCall?: number;
    pricing: PricingInfo;
  };
  private callCount = 0;

  constructor(options: MockProviderOptions = {}) {
    this.options = {
      model: options.model ?? 'mock-default',
      name: options.name ?? 'Mock Provider',
      provider: options.provider ?? 'mock',
      contextWindow: options.contextWindow ?? 200_000,
      maxOutputTokens: options.maxOutputTokens ?? 8_192,
      pricing: options.pricing ?? { inputPerMillion: 0, outputPerMillion: 0 },
      response: options.response ?? this.defaultResponder,
      toolCalls: options.toolCalls,
      latencyMs: options.latencyMs ?? 0,
      failOnCall: options.failOnCall,
      streamChunks: options.streamChunks ?? true,
    };
  }

  /** Default responder: echo the last user message back in a structured way. */
  private defaultResponder = (messages: Message[]): string => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const userText = lastUser?.content ?? '';
    return [
      'Mock response — no real model is configured.',
      '',
      `Mode: ${this.options.provider}/${this.options.model}`,
      `Last user message: ${userText.slice(0, 500)}`,
      '',
      'To use a real model, set ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY, or run `chimera setup`.',
    ].join('\n');
  };

  async complete(prompt: Message[], _options?: CompletionOptions): Promise<CompletionResult> {
    this.callCount += 1;
    if (this.options.failOnCall && this.callCount === this.options.failOnCall) {
      throw new Error('MockProvider injected failure');
    }
    if (this.options.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.latencyMs));
    }

    const text = typeof this.options.response === 'function'
      ? this.options.response(prompt)
      : this.options.response;

    const usage: TokenUsage = {
      inputTokens: this.countTokensForMessages(prompt),
      outputTokens: this.countTokens(text),
    };

    return {
      content: text,
      toolCalls: this.options.toolCalls,
      finishReason: this.options.toolCalls?.length ? 'tool_use' : 'end_turn',
      usage,
    };
  }

  async *stream(prompt: Message[], _options?: CompletionOptions): AsyncIterable<StreamChunk> {
    const result = await this.complete(prompt);
    if (this.options.streamChunks) {
      const words = result.content.split(/(\s+)/);
      for (const word of words) {
        if (word.length === 0) continue;
        yield { content: word };
      }
    } else {
      yield { content: result.content };
    }
    if (result.toolCalls && result.toolCalls.length > 0) {
      yield { toolCalls: result.toolCalls };
    }
    yield { finishReason: result.finishReason, usage: result.usage };
  }

  getModel(): ModelInfo {
    return {
      id: this.options.model,
      name: this.options.name,
      provider: this.options.provider,
      contextWindow: this.options.contextWindow,
      maxOutputTokens: this.options.maxOutputTokens,
    };
  }

  getContextWindow(): number {
    return this.options.contextWindow;
  }

  getMaxOutputTokens(): number {
    return this.options.maxOutputTokens;
  }

  getCost(tokens: { input: number; output: number }): number {
    const inputCost = (tokens.input / 1_000_000) * this.options.pricing.inputPerMillion;
    const outputCost = (tokens.output / 1_000_000) * this.options.pricing.outputPerMillion;
    return inputCost + outputCost;
  }

  getPricing(): PricingInfo {
    return { ...this.options.pricing };
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
    return false;
  }

  supportsReasoning(): boolean {
    return false;
  }

  countTokens(text: string): number {
    if (!text) return 0;
    // Reasonable approximation: ~3.5 chars/token.
    return Math.ceil(text.length / 3.5);
  }

  countTokensForMessages(messages: Message[]): number {
    let total = 0;
    for (const m of messages) {
      total += this.countTokens(m.content);
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          total += this.countTokens(tc.name) + this.countTokens(tc.arguments);
        }
      }
    }
    return total;
  }
}

/** Convenience: build a default mock provider for "no keys configured" runs. */
export function createDefaultMockProvider(): MockProvider {
  return new MockProvider({
    model: 'mock-default',
    name: 'Chimera Mock Provider',
    provider: 'mock',
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
  });
}
