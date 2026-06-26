import { describe, it, expect } from 'vitest';
import { ModelRegistry } from '../model-registry.js';

describe('ModelRegistry', () => {
  it('pre-populates with 30+ models', () => {
    const registry = new ModelRegistry();
    expect(registry.getAll().length).toBeGreaterThanOrEqual(30);
  });

  it('gets a model by id', () => {
    const registry = new ModelRegistry();
    const model = registry.get('anthropic/claude-sonnet-4-20250514');
    expect(model).toBeDefined();
    expect(model?.name).toBe('Claude Sonnet 4');
    expect(model?.tier).toBe('mid');
  });

  it('returns undefined for unknown model', () => {
    const registry = new ModelRegistry();
    expect(registry.get('unknown/model')).toBeUndefined();
  });

  it('filters by provider', () => {
    const registry = new ModelRegistry();
    const anthropic = registry.getByProvider('anthropic');
    expect(anthropic.length).toBeGreaterThanOrEqual(3);
    expect(anthropic.every((m) => m.provider === 'anthropic')).toBe(true);
  });

  it('filters by tier', () => {
    const registry = new ModelRegistry();
    const cheap = registry.getByTier('cheap');
    const frontier = registry.getByTier('frontier');
    expect(cheap.length).toBeGreaterThanOrEqual(3);
    expect(frontier.length).toBeGreaterThanOrEqual(3);
    expect(cheap.every((m) => m.tier === 'cheap')).toBe(true);
    expect(frontier.every((m) => m.tier === 'frontier')).toBe(true);
  });

  it('searches by name', () => {
    const registry = new ModelRegistry();
    const results = registry.search('sonnet');
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every((m) => m.name.toLowerCase().includes('sonnet') || m.id.toLowerCase().includes('sonnet'))).toBe(true);
  });

  it('searches by provider', () => {
    const registry = new ModelRegistry();
    const results = registry.search('google');
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.every((m) => m.provider === 'google')).toBe(true);
  });

  it('registers a new model', () => {
    const registry = new ModelRegistry([]);
    expect(registry.isRegistered('test/model')).toBe(false);

    registry.register({
      id: 'test/model',
      name: 'Test Model',
      provider: 'test',
      contextWindow: 1000,
      maxOutputTokens: 500,
      pricing: { inputPerMillion: 1, outputPerMillion: 2 },
      capabilities: { toolCalling: false, structuredOutput: false, vision: false, reasoning: false, parallelToolCalls: false },
      degradationThreshold: 0.7,
      tier: 'cheap',
    });

    expect(registry.isRegistered('test/model')).toBe(true);
    expect(registry.get('test/model')?.name).toBe('Test Model');
  });

  it('identifies deprecated models', () => {
    const registry = new ModelRegistry();
    const deprecated = registry.getAll().filter((m) => m.deprecated);
    expect(deprecated.length).toBeGreaterThanOrEqual(2);
    expect(deprecated.every((m) => m.replacement !== undefined)).toBe(true);
  });

  it('includes pricing for all models', () => {
    const registry = new ModelRegistry();
    for (const model of registry.getAll()) {
      expect(model.pricing.inputPerMillion).toBeGreaterThanOrEqual(0);
      expect(model.pricing.outputPerMillion).toBeGreaterThanOrEqual(0);
    }
  });

  it('includes capabilities for all models', () => {
    const registry = new ModelRegistry();
    for (const model of registry.getAll()) {
      expect(typeof model.capabilities.toolCalling).toBe('boolean');
      expect(typeof model.capabilities.structuredOutput).toBe('boolean');
      expect(typeof model.capabilities.vision).toBe('boolean');
      expect(typeof model.capabilities.reasoning).toBe('boolean');
      expect(typeof model.capabilities.parallelToolCalls).toBe('boolean');
    }
  });
});
