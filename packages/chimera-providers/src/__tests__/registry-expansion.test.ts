import { describe, it, expect } from 'vitest';
import { ModelRegistry } from '../model-registry.js';
import { ProviderFactory, ProviderTypeSchema } from '../provider-factory.js';
import { OpenAICompatibleProvider } from '../providers/openai-compatible.js';

const NEW_MODEL_IDS = [
  'xai/grok-4',
  'xai/grok-4.1',
  'xai/grok-4-fast',
  'perplexity/sonar',
  'perplexity/sonar-pro',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
  'openai/o3',
  'anthropic/claude-opus-4.1',
  'anthropic/claude-haiku-4.5',
  'google/gemini-3-pro',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'deepseek/deepseek-v4',
  'meta/llama-4-scout',
  'mistral/mistral-large-3',
  'mistral/mistral-medium-3',
  'qwen/qwen3-235b',
  'qwen/qwen3-32b',
  'cohere/command-a',
  'cohere/command-r7b',
];

const BASE_CONSTRAINTS = {
  maxTokensPerTurn: 4096,
  costCapPerTask: 1,
  costCapPerSession: 10,
  costCapPerDay: 100,
  maxParallelInstances: 1,
  rateLimitRpm: 60,
};

describe('Registry Expansion', () => {
  it('includes all new model IDs', () => {
    const registry = new ModelRegistry(undefined, { skipCacheLoading: true });
    const allIds = new Set(registry.getAll().map((m) => m.id));
    for (const id of NEW_MODEL_IDS) {
      expect(allIds.has(id)).toBe(true);
    }
  });

  it('counts 50+ total models', () => {
    const registry = new ModelRegistry(undefined, { skipCacheLoading: true });
    expect(registry.getAll().length).toBeGreaterThanOrEqual(50);
  });
});

describe('ProviderFactory creates new providers', () => {
  it('builds an xai provider without throwing', () => {
    const provider = ProviderFactory.create({
      name: 'test-xai',
      provider: 'xai',
      model: 'grok-4',
      apiKey: 'fake-key',
      role: 'writer',
      constraints: BASE_CONSTRAINTS,
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it('builds a perplexity provider without throwing', () => {
    const provider = ProviderFactory.create({
      name: 'test-perplexity',
      provider: 'perplexity',
      model: 'sonar-pro',
      apiKey: 'fake-key',
      role: 'writer',
      constraints: BASE_CONSTRAINTS,
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it('builds a cohere provider without throwing', () => {
    const provider = ProviderFactory.create({
      name: 'test-cohere',
      provider: 'cohere',
      model: 'command-a',
      apiKey: 'fake-key',
      role: 'writer',
      constraints: BASE_CONSTRAINTS,
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it('builds a deepseek provider without throwing', () => {
    const provider = ProviderFactory.create({
      name: 'test-deepseek',
      provider: 'deepseek',
      model: 'deepseek-v4',
      apiKey: 'fake-key',
      role: 'writer',
      constraints: BASE_CONSTRAINTS,
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it('builds a mistral provider without throwing', () => {
    const provider = ProviderFactory.create({
      name: 'test-mistral',
      provider: 'mistral',
      model: 'mistral-large-3',
      apiKey: 'fake-key',
      role: 'writer',
      constraints: BASE_CONSTRAINTS,
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });
});

describe('ProviderTypeSchema accepts new enum members', () => {
  it.each([
    'xai', 'perplexity', 'cohere', 'mistral',
    'meta', 'deepseek', 'qwen', 'moonshot',
  ])('accepts %s', (provider) => {
    const result = ProviderTypeSchema.safeParse(provider);
    expect(result.success).toBe(true);
  });
});