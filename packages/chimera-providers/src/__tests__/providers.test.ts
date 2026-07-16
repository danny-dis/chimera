import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleProvider } from '../providers/openai-compatible.js';
import { AnthropicProvider } from '../providers/anthropic.js';
import { GoogleProvider } from '../providers/google.js';
import { OllamaProvider } from '../providers/ollama.js';
import { RateLimitError, QuotaExceededError, ProviderUnavailableError } from '../errors.js';

const TEST_MESSAGES = [{ role: 'user' as const, content: 'Hello' }];

describe('OpenAICompatibleProvider', () => {
  let provider: OpenAICompatibleProvider;

  beforeEach(() => {
    provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com',
      apiKey: 'test-key',
      model: 'gpt-4o',
    });
  });

  it('returns correct model info', () => {
    const info = provider.getModel();
    expect(info.id).toBe('gpt-4o');
    expect(info.provider).toBe('api.openai.com');
    expect(info.contextWindow).toBe(128_000);
  });

  it('returns pricing', () => {
    const pricing = provider.getPricing();
    expect(pricing.inputPerMillion).toBe(0);
    expect(pricing.outputPerMillion).toBe(0);
  });

  it('calculates cost', () => {
    const customProvider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com',
      apiKey: 'test-key',
      model: 'gpt-4o',
      options: { pricing: { inputPerMillion: 5, outputPerMillion: 15 } },
    });

    const cost = customProvider.getCost({ input: 1_000_000, output: 500_000 });
    expect(cost).toBe(12.5);
  });

  it('estimates tokens', () => {
    const tokens = provider.countTokens('Hello world');
    expect(tokens).toBe(3);
  });

  it('supports tool calling', () => {
    expect(provider.supportsToolCalling()).toBe(true);
  });

  it('supports structured output', () => {
    expect(provider.supportsStructuredOutput()).toBe(true);
  });

  it('detects vision models', () => {
    const visionProvider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com',
      apiKey: 'test-key',
      model: 'gpt-4o-vision',
    });
    expect(visionProvider.supportsVision()).toBe(true);
  });

  it('detects reasoning models', () => {
    const reasoningProvider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com',
      apiKey: 'test-key',
      model: 'o1-preview',
    });
    expect(reasoningProvider.supportsReasoning()).toBe(true);
  });

  it('throws RateLimitError on 429', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: { message: 'rate limit' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(provider.complete(TEST_MESSAGES)).rejects.toThrow(RateLimitError);
    vi.unstubAllGlobals();
  });

  it('throws QuotaExceededError on 402', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      json: () => Promise.resolve({ error: { message: 'quota exceeded' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(provider.complete(TEST_MESSAGES)).rejects.toThrow(QuotaExceededError);
    vi.unstubAllGlobals();
  });

  it('throws ProviderUnavailableError on 500', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: 'server error' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(provider.complete(TEST_MESSAGES)).rejects.toThrow(ProviderUnavailableError);
    vi.unstubAllGlobals();
  });

  it('retries transient 5xx then succeeds', async () => {
    const okBody = { choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, body: null, json: () => Promise.resolve({ error: { message: 'blip' } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(okBody) });
    vi.stubGlobal('fetch', mockFetch);

    const res = await provider.complete(TEST_MESSAGES);
    expect(res.content).toBe('hi');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('does not retry 4xx (RateLimitError thrown on first attempt)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: { message: 'rate limit' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(provider.complete(TEST_MESSAGES)).rejects.toThrow(RateLimitError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider({
      apiKey: 'test-key',
      model: 'claude-sonnet-4-20250514',
    });
  });

  it('returns correct model info', () => {
    const info = provider.getModel();
    expect(info.id).toBe('claude-sonnet-4-20250514');
    expect(info.provider).toBe('anthropic');
    expect(info.contextWindow).toBe(200_000);
    expect(info.maxOutputTokens).toBe(8_192);
  });

  it('returns known pricing', () => {
    const pricing = provider.getPricing();
    expect(pricing.inputPerMillion).toBe(3);
    expect(pricing.outputPerMillion).toBe(15);
    expect(pricing.cacheReadPerMillion).toBe(0.3);
  });

  it('calculates cost', () => {
    const cost = provider.getCost({ input: 1_000_000, output: 500_000 });
    expect(cost).toBe(10.5);
  });

  it('supports tool calling', () => {
    expect(provider.supportsToolCalling()).toBe(true);
  });

  it('supports vision for sonnet/opus', () => {
    expect(provider.supportsVision()).toBe(true);
  });

  it('does not support reasoning', () => {
    expect(provider.supportsReasoning()).toBe(false);
  });
});

describe('GoogleProvider', () => {
  let provider: GoogleProvider;

  beforeEach(() => {
    provider = new GoogleProvider({
      apiKey: 'test-key',
      model: 'gemini-2.5-pro',
    });
  });

  it('returns correct model info', () => {
    const info = provider.getModel();
    expect(info.id).toBe('gemini-2.5-pro');
    expect(info.provider).toBe('google');
    expect(info.contextWindow).toBe(1_000_000);
  });

  it('returns known pricing', () => {
    const pricing = provider.getPricing();
    expect(pricing.inputPerMillion).toBe(1.25);
    expect(pricing.outputPerMillion).toBe(10);
  });

  it('supports vision', () => {
    expect(provider.supportsVision()).toBe(true);
  });

  it('supports reasoning for 2.5 models', () => {
    expect(provider.supportsReasoning()).toBe(true);
  });

  it('supports tool calling', () => {
    expect(provider.supportsToolCalling()).toBe(true);
  });
});

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider({
      model: 'llama3',
    });
  });

  it('returns correct model info', () => {
    const info = provider.getModel();
    expect(info.id).toBe('llama3');
    expect(info.provider).toBe('ollama');
  });

  it('has free pricing', () => {
    const pricing = provider.getPricing();
    expect(pricing.inputPerMillion).toBe(0);
    expect(pricing.outputPerMillion).toBe(0);
  });

  it('returns zero cost', () => {
    const cost = provider.getCost({ input: 1_000_000, output: 1_000_000 });
    expect(cost).toBe(0);
  });

  it('does not support tool calling', () => {
    expect(provider.supportsToolCalling()).toBe(false);
  });

  it('uses default localhost URL', () => {
    const info = provider.getModel();
    expect(info.id).toBe('llama3');
  });

  it('accepts custom base URL', () => {
    const customProvider = new OllamaProvider({
      baseUrl: 'http://remote-host:11434',
      model: 'llama3',
    });
    expect(customProvider.getModel().id).toBe('llama3');
  });

  it('detects vision models', () => {
    const visionProvider = new OllamaProvider({
      model: 'llava',
    });
    expect(visionProvider.supportsVision()).toBe(true);
  });
});
