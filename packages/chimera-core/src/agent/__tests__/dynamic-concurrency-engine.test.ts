import { describe, expect, test, vi } from 'vitest';
import { DynamicConcurrencyEngine } from '../dynamic-concurrency-engine';
import { ProviderConfig } from '../../../../chimera-providers/src/model-adapter';

describe('DynamicConcurrencyEngine', () => {
  test('should suggest default soft limit under normal conditions', () => {
    const engine = new DynamicConcurrencyEngine();
    // Default soft limit is 5
    expect(engine.getSuggestedConcurrency()).toBeLessThanOrEqual(5);
  });

  test('should respect high mode override', () => {
    const engine = new DynamicConcurrencyEngine();
    // High mode should be at least 25 (DEFAULT_SOFT_LIMIT * 5)
    const concurrency = engine.getSuggestedConcurrency(undefined, { mode: 'high' });
    expect(concurrency).toBeGreaterThanOrEqual(25);
  });

  test('should respect explicit limit override', () => {
    const engine = new DynamicConcurrencyEngine();
    const explicitLimit = 50;
    const concurrency = engine.getSuggestedConcurrency(undefined, { explicitLimit });
    expect(concurrency).toBeGreaterThanOrEqual(explicitLimit);
  });

  test('should cap concurrency based on provider constraints', () => {
    const engine = new DynamicConcurrencyEngine();
    const providerConfig: ProviderConfig = {
      name: 'test-provider',
      provider: 'test',
      model: 'test-model',
      role: 'writer',
      constraints: {
        maxTokensPerTurn: 1000,
        costCapPerTask: 1,
        costCapPerSession: 1,
        costCapPerDay: 1,
        maxParallelInstances: 2, // Provider limit
        rateLimitRpm: 100,
      },
    };
    // Even with 'high' override (target 25), it should be capped at 2
    const concurrency = engine.getSuggestedConcurrency(providerConfig, { mode: 'high' });
    expect(concurrency).toBeLessThanOrEqual(2);
  });
});
