import { describe, it, expect } from 'vitest';
import { FallbackChain, FallbackEvent } from '../fallback-chain.js';
import { ModelProvider, Message, CompletionResult, StreamChunk, ModelInfo, PricingInfo } from '../types/provider.js';
import { RateLimitError, ProviderUnavailableError, ProviderError } from '../errors.js';

const TEST_MESSAGES: Message[] = [{ role: 'user', content: 'test' }];

function createMockProvider(
  name: string,
  options: {
    completeResult?: CompletionResult;
    completeError?: Error;
    streamChunks?: StreamChunk[];
    streamError?: Error;
  } = {},
): ModelProvider {
  const modelInfo: ModelInfo = {
    id: name,
    name,
    provider: 'test',
    contextWindow: 8192,
    maxOutputTokens: 4096,
  };

  const pricing: PricingInfo = { inputPerMillion: 1, outputPerMillion: 2 };

  return {
    async complete() {
      if (options.completeError) throw options.completeError;
      return options.completeResult ?? {
        content: `response from ${name}`,
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 20 },
      };
    },
    async *stream() {
      if (options.streamError) throw options.streamError;
      for (const chunk of options.streamChunks ?? [{ content: `chunk from ${name}` }]) {
        yield chunk;
      }
    },
    getModel: () => ({ ...modelInfo }),
    getContextWindow: () => modelInfo.contextWindow,
    getMaxOutputTokens: () => modelInfo.maxOutputTokens,
    getCost: (tokens) => (tokens.input / 1_000_000) * pricing.inputPerMillion + (tokens.output / 1_000_000) * pricing.outputPerMillion,
    getPricing: () => ({ ...pricing }),
    supportsToolCalling: () => true,
    supportsStructuredOutput: () => true,
    supportsVision: () => false,
    supportsReasoning: () => false,
    countTokens: (text) => Math.ceil(text.length / 4),
    countTokensForMessages: (msgs) => msgs.reduce((sum, m) => sum + Math.ceil(m.content.length / 4) + 4, 0),
  };
}

describe('FallbackChain', () => {
  it('returns result from primary provider', async () => {
    const primary = createMockProvider('primary', {
      completeResult: { content: 'primary response', finishReason: 'stop', usage: { inputTokens: 5, outputTokens: 10 } },
    });
    const chain = new FallbackChain([primary]);

    const result = await chain.complete(TEST_MESSAGES);
    expect(result.content).toBe('primary response');
  });

  it('falls back to secondary on retryable error', async () => {
    const primary = createMockProvider('primary', {
      completeError: new RateLimitError('rate limited'),
    });
    const secondary = createMockProvider('secondary', {
      completeResult: { content: 'secondary response', finishReason: 'stop', usage: { inputTokens: 5, outputTokens: 10 } },
    });
    const chain = new FallbackChain([primary, secondary]);

    const events: FallbackEvent[] = [];
    chain.on('fallback', (e) => events.push(e));

    const result = await chain.complete(TEST_MESSAGES);
    expect(result.content).toBe('secondary response');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('fallback');
  });

  it('does not fallback on non-retryable error', async () => {
    const primary = createMockProvider('primary', {
      completeError: new ProviderError('invalid request', 'primary', 400),
    });
    const secondary = createMockProvider('secondary');
    const chain = new FallbackChain([primary, secondary]);

    await expect(chain.complete(TEST_MESSAGES)).rejects.toThrow('invalid request');
  });

  it('throws when all providers fail', async () => {
    const primary = createMockProvider('primary', {
      completeError: new RateLimitError('rate limited'),
    });
    const secondary = createMockProvider('secondary', {
      completeError: new ProviderUnavailableError('server down'),
    });
    const chain = new FallbackChain([primary, secondary]);

    await expect(chain.complete(TEST_MESSAGES)).rejects.toThrow('All 2 providers in fallback chain failed');
  });

  it('opens circuit after 3 consecutive failures', async () => {
    const primary = createMockProvider('primary', {
      completeError: new RateLimitError('rate limited'),
    });
    const secondary = createMockProvider('secondary');
    const chain = new FallbackChain([primary, secondary]);

    const events: FallbackEvent[] = [];
    chain.on('circuit_open', (e) => events.push(e));

    for (let i = 0; i < 4; i++) {
      await chain.complete(TEST_MESSAGES);
    }

    const openEvents = events.filter((e) => e.type === 'circuit_open');
    expect(openEvents.length).toBeGreaterThanOrEqual(1);
    expect(openEvents[0].provider).toBe('primary');
  });

  it('skips circuit-broken provider on subsequent calls', async () => {
    const primary = createMockProvider('primary', {
      completeError: new RateLimitError('rate limited'),
    });
    const secondary = createMockProvider('secondary');
    const chain = new FallbackChain([primary, secondary]);

    for (let i = 0; i < 3; i++) {
      await chain.complete(TEST_MESSAGES);
    }

    const result = await chain.complete(TEST_MESSAGES);
    expect(result.content).toBe('response from secondary');
  });

  it('streams from primary provider', async () => {
    const primary = createMockProvider('primary', {
      streamChunks: [
        { content: 'chunk1' },
        { content: 'chunk2', finishReason: 'stop' },
      ],
    });
    const chain = new FallbackChain([primary]);

    const chunks: StreamChunk[] = [];
    for await (const chunk of chain.stream(TEST_MESSAGES)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toBe('chunk1');
    expect(chunks[1].content).toBe('chunk2');
  });

  it('falls back on stream error', async () => {
    const primary = createMockProvider('primary', {
      streamError: new ProviderUnavailableError('stream broke'),
    });
    const secondary = createMockProvider('secondary', {
      streamChunks: [{ content: 'fallback chunk' }],
    });
    const chain = new FallbackChain([primary, secondary]);

    const chunks: StreamChunk[] = [];
    for await (const chunk of chain.stream(TEST_MESSAGES)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('fallback chunk');
  });

  it('requires at least one provider', () => {
    expect(() => new FallbackChain([])).toThrow('at least one provider');
  });

  it('unregisters listener with off', async () => {
    const primary = createMockProvider('primary', {
      completeError: new RateLimitError('rate limited'),
    });
    const secondary = createMockProvider('secondary');
    const chain = new FallbackChain([primary, secondary]);

    const listener = (e: FallbackEvent) => {
      void e;
    };
    chain.on('fallback', listener);
    chain.off(listener);

    await chain.complete(TEST_MESSAGES);
  });
});
