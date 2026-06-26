import { describe, it, expect } from 'vitest';
import { ModelRegistry } from '../model-registry.js';
import { ModelComparator } from '../model-comparator.js';

describe('ModelComparator', () => {
  const registry = new ModelRegistry();
  const comparator = new ModelComparator(registry);

  it('compares multiple models', () => {
    const comparison = comparator.compare(
      ['anthropic/claude-sonnet-4-20250514', 'openai/gpt-4o', 'google/gemini-2.0-flash'],
      10_000,
      5_000,
    );

    expect(comparison.models.length).toBe(3);
    expect(comparison.costPerTask.size).toBe(3);
    expect(comparison.qualityScore.size).toBe(3);
    expect(comparison.costEfficiency.size).toBe(3);
    expect(comparison.recommendation).toBeTruthy();
  });

  it('skips unknown models', () => {
    const comparison = comparator.compare(
      ['anthropic/claude-sonnet-4-20250514', 'unknown/model'],
      10_000,
      5_000,
    );

    expect(comparison.models.length).toBe(1);
  });

  it('cheaper models have higher cost efficiency', () => {
    const comparison = comparator.compare(
      ['google/gemini-2.0-flash', 'anthropic/claude-opus-4'],
      10_000,
      5_000,
    );

    const flashEfficiency = comparison.costEfficiency.get('google/gemini-2.0-flash') ?? 0;
    const opusEfficiency = comparison.costEfficiency.get('anthropic/claude-opus-4') ?? 0;
    expect(flashEfficiency).toBeGreaterThan(opusEfficiency);
  });

  it('frontier models have higher quality scores', () => {
    const comparison = comparator.compare(
      ['google/gemini-2.0-flash', 'anthropic/claude-opus-4'],
      10_000,
      5_000,
    );

    const flashQuality = comparison.qualityScore.get('google/gemini-2.0-flash') ?? 0;
    const opusQuality = comparison.qualityScore.get('anthropic/claude-opus-4') ?? 0;
    expect(opusQuality).toBeGreaterThan(flashQuality);
  });

  it('recommends for simple task within budget', () => {
    const recommendation = comparator.recommendForTask(3, 0.01);
    expect(recommendation).toBeTruthy();
    const model = registry.get(recommendation);
    expect(model).toBeDefined();
  });

  it('recommends for complex task within budget', () => {
    const recommendation = comparator.recommendForTask(8, 0.1);
    expect(recommendation).toBeTruthy();
    const model = registry.get(recommendation);
    expect(model).toBeDefined();
    expect(model?.tier).toMatch(/frontier|reasoning/);
  });

  it('returns empty string when no model fits budget', () => {
    const recommendation = comparator.recommendForTask(9, 0.000001);
    expect(recommendation).toBe('');
  });

  it('returns empty string when task complexity too high', () => {
    const recommendation = comparator.recommendForTask(100, 100);
    expect(recommendation).toBe('');
  });

  it('recommendation has best cost/quality ratio', () => {
    const comparison = comparator.compare(
      [
        'google/gemini-2.0-flash',
        'openai/gpt-4o-mini',
        'deepseek/deepseek-v3',
      ],
      10_000,
      5_000,
    );

    expect(comparison.recommendation).toBe(comparison.models[0]?.id);
    const recEfficiency = comparison.costEfficiency.get(comparison.recommendation) ?? 0;
    for (const [id, efficiency] of comparison.costEfficiency) {
      if (id !== comparison.recommendation) {
        expect(recEfficiency).toBeGreaterThanOrEqual(efficiency);
      }
    }
  });
});
