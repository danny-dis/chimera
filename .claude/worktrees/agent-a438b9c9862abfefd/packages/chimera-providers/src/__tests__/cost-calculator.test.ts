import { describe, it, expect } from 'vitest';
import { ModelRegistry } from '../model-registry.js';
import { CostCalculator } from '../cost-calculator.js';

describe('CostCalculator', () => {
  const registry = new ModelRegistry();
  const calculator = new CostCalculator(registry);

  it('calculates basic input/output cost', () => {
    const breakdown = calculator.calculate('anthropic/claude-sonnet-4-20250514', {
      input: 1_000_000,
      output: 500_000,
    });

    expect(breakdown.inputCost).toBeCloseTo(3.0, 2);
    expect(breakdown.outputCost).toBeCloseTo(7.5, 2);
    expect(breakdown.cacheReadCost).toBe(0);
    expect(breakdown.cacheWriteCost).toBe(0);
    expect(breakdown.totalCost).toBeCloseTo(10.5, 2);
  });

  it('calculates cache costs when available', () => {
    const breakdown = calculator.calculate('anthropic/claude-sonnet-4-20250514', {
      input: 1_000_000,
      output: 0,
      cacheRead: 500_000,
      cacheWrite: 200_000,
    });

    expect(breakdown.cacheReadCost).toBeCloseTo(0.15, 2);
    expect(breakdown.cacheWriteCost).toBeCloseTo(0.75, 2);
  });

  it('handles models without cache pricing', () => {
    const breakdown = calculator.calculate('qwen/qwen-2.5-72b', {
      input: 1_000_000,
      output: 500_000,
      cacheRead: 500_000,
      cacheWrite: 200_000,
    });

    expect(breakdown.cacheReadCost).toBe(0);
    expect(breakdown.cacheWriteCost).toBe(0);
    expect(breakdown.totalCost).toBeCloseTo(1.0, 2);
  });

  it('calculates cost for cheap models', () => {
    const breakdown = calculator.calculate('google/gemini-2.0-flash', {
      input: 1_000_000,
      output: 1_000_000,
    });

    expect(breakdown.totalCost).toBeCloseTo(0.5, 2);
  });

  it('calculates cost for frontier models', () => {
    const breakdown = calculator.calculate('anthropic/claude-opus-4', {
      input: 1_000_000,
      output: 500_000,
    });

    expect(breakdown.totalCost).toBeCloseTo(52.5, 2);
  });

  it('throws for unknown model', () => {
    expect(() => calculator.calculate('unknown/model', { input: 100, output: 100 })).toThrow(
      'Model not found in registry: unknown/model',
    );
  });

  it('calculates from messages', () => {
    const breakdown = calculator.calculateFromMessages('openai/gpt-4o-mini', [
      { role: 'user', content: 'Hello world' },
      { role: 'assistant', content: 'Hi there!' },
    ]);

    expect(breakdown.inputCost).toBeGreaterThan(0);
    expect(breakdown.outputCost).toBe(0);
    expect(breakdown.tokenCount.input).toBeGreaterThan(0);
  });

  it('estimates for task with output ratio', () => {
    const breakdown = calculator.estimateForTask('deepseek/deepseek-v3', 10_000, 0.5);

    expect(breakdown.tokenCount.input).toBe(10_000);
    expect(breakdown.tokenCount.output).toBe(5_000);
    expect(breakdown.totalCost).toBeGreaterThan(0);
  });

  it('returns zero cost for zero tokens', () => {
    const breakdown = calculator.calculate('openai/gpt-4o-mini', {
      input: 0,
      output: 0,
    });

    expect(breakdown.totalCost).toBe(0);
  });

  it('token counts are preserved in breakdown', () => {
    const breakdown = calculator.calculate('openai/gpt-4o', {
      input: 5000,
      output: 3000,
      cacheRead: 1000,
      cacheWrite: 2000,
    });

    expect(breakdown.tokenCount.input).toBe(5000);
    expect(breakdown.tokenCount.output).toBe(3000);
    expect(breakdown.tokenCount.cacheRead).toBe(1000);
    expect(breakdown.tokenCount.cacheWrite).toBe(2000);
  });
});
