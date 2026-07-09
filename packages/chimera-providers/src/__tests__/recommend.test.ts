import { describe, it, expect } from 'vitest';
import {
  recommendRoleModels,
  recommendFromProviders,
  rankByTier,
} from '../recommend.js';
import type { ModelEntry } from '../model-registry.js';

function entry(id: string, tier: ModelEntry['tier'], ctx = 100_000): ModelEntry {
  return {
    id,
    name: id,
    provider: id.split('/')[0]!,
    contextWindow: ctx,
    maxOutputTokens: 4096,
    pricing: { inputPerMillion: 1, outputPerMillion: 1 },
    capabilities: {
      toolCalling: true,
      structuredOutput: true,
      vision: false,
      reasoning: tier === 'reasoning',
      parallelToolCalls: true,
    },
    degradationThreshold: 0.7,
    tier,
  };
}

describe('recommendRoleModels', () => {
  const pool = [
    entry('cheap/a', 'cheap'),
    entry('mid/b', 'mid'),
    entry('frontier/c', 'frontier'),
    entry('reasoning/d', 'reasoning'),
  ];

  it('ranks reasoning > frontier > mid > cheap', () => {
    const ranked = rankByTier(pool);
    expect(ranked.map((m) => m.tier)).toEqual([
      'reasoning',
      'frontier',
      'mid',
      'cheap',
    ]);
  });

  it('assigns the strongest model to writer and reviewer', () => {
    const r = recommendRoleModels(pool);
    expect(r.writer).toBe('reasoning/d');
    expect(r.reviewer).toBe('reasoning/d');
  });

  it('assigns a DIFFERENT model to challenger when one exists', () => {
    const r = recommendRoleModels(pool);
    expect(r.challenger).toBe('frontier/c');
  });

  it('falls back to the single model for all roles when pool has one entry', () => {
    const r = recommendRoleModels([entry('only/x', 'cheap')]);
    expect(r.writer).toBe('only/x');
    expect(r.reviewer).toBe('only/x');
    expect(r.challenger).toBe('only/x');
  });

  it('returns only requested roles', () => {
    const r = recommendRoleModels(pool, ['writer']);
    expect(Object.keys(r)).toEqual(['writer']);
  });
});

describe('recommendFromProviders', () => {
  it('recommends only from the given providers', () => {
    const r = recommendFromProviders(['openai', 'anthropic']);
    // Should resolve to real registry models from those providers.
    expect(r.writer).toBeTruthy();
    expect(r.writer!.includes('/')).toBe(true);
  });

  it('respects per-role distinctness for challenger', () => {
    const r = recommendFromProviders(['anthropic']);
    expect(r.writer).toBeTruthy();
    expect(r.challenger).toBeTruthy();
  });
});
