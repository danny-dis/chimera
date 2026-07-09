import { describe, it, expect } from 'vitest';
import { inferCapabilities, buildPool, coreToolsForTier, contextBudgetForTier } from '../model-capabilities.js';

describe('inferCapabilities', () => {
  it('infers frontier tier for gpt-4o', () => {
    const cap = inferCapabilities('gpt-4o');
    expect(cap.tier).toBe('frontier');
    expect(cap.specialties).toContain('reasoning');
    expect(cap.specialties).toContain('code_generation');
  });

  it('infers frontier tier for claude-3.5-sonnet', () => {
    const cap = inferCapabilities('claude-3.5-sonnet');
    expect(cap.tier).toBe('frontier');
    expect(cap.specialties).toContain('code_review');
  });

  it('infers mid tier for gemini-2.5-flash', () => {
    const cap = inferCapabilities('gemini-2.5-flash');
    expect(cap.tier).toBe('mid');
    expect(cap.specialties).toContain('general');
  });

  it('infers cheap tier for gemini-flash-lite', () => {
    const cap = inferCapabilities('gemini-2.0-flash-lite');
    expect(cap.tier).toBe('cheap');
    expect(cap.specialties).toContain('summarization');
  });

  it('falls back to mid/general for unknown models', () => {
    const cap = inferCapabilities('my-custom-model-v3');
    expect(cap.tier).toBe('mid');
    expect(cap.specialties).toEqual(['general']);
  });

  it('preserves modelId in output', () => {
    const cap = inferCapabilities('deepseek-r1');
    expect(cap.modelId).toBe('deepseek-r1');
  });

  it('infers frontier tier for xai/grok-4 (provider prefix)', () => {
    expect(inferCapabilities('xai/grok-4').tier).toBe('frontier');
  });

  it('infers reasoning tier for perplexity/sonar-pro', () => {
    expect(inferCapabilities('perplexity/sonar-pro').tier).toBe('reasoning');
  });

  it('infers frontier tier for openai/gpt-5', () => {
    expect(inferCapabilities('openai/gpt-5').tier).toBe('frontier');
  });

  it('infers frontier tier for anthropic/claude-opus-4.1', () => {
    expect(inferCapabilities('anthropic/claude-opus-4.1').tier).toBe('frontier');
  });

  it('infers frontier tier for google/gemini-3-pro', () => {
    expect(inferCapabilities('google/gemini-3-pro').tier).toBe('frontier');
  });

  it('infers frontier tier for deepseek/deepseek-v4', () => {
    expect(inferCapabilities('deepseek/deepseek-v4').tier).toBe('frontier');
  });

  it('infers mid tier for meta/llama-4-scout', () => {
    expect(inferCapabilities('meta/llama-4-scout').tier).toBe('mid');
  });

  it('infers frontier tier for mistral/mistral-large-3', () => {
    expect(inferCapabilities('mistral/mistral-large-3').tier).toBe('frontier');
  });

  it('infers mid tier for qwen/qwen3-32b', () => {
    expect(inferCapabilities('qwen/qwen3-32b').tier).toBe('mid');
  });

  it('infers frontier tier for cohere/command-a', () => {
    expect(inferCapabilities('cohere/command-a').tier).toBe('frontier');
  });

  it('infers mid tier for openai/gpt-5-mini', () => {
    expect(inferCapabilities('openai/gpt-5-mini').tier).toBe('mid');
  });

  it('falls back to mid for some-unknown-model', () => {
    expect(inferCapabilities('some-unknown-model').tier).toBe('mid');
  });
});

describe('buildPool', () => {
  it('builds a pool from model IDs', () => {
    const pool = buildPool(['gpt-4o', 'gemini-2.5-flash', 'gemini-2.0-flash-lite']);
    expect(pool.models).toHaveLength(3);
    expect(pool.models[0].tier).toBe('frontier');
    expect(pool.models[1].tier).toBe('mid');
    expect(pool.models[2].tier).toBe('cheap');
    expect(pool.preferFrontierForJudge).toBe(true);
  });

  it('defaults preferFrontierForJudge to true', () => {
    const pool = buildPool(['gpt-4o']);
    expect(pool.preferFrontierForJudge).toBe(true);
  });
});

describe('coreToolsForTier', () => {
  it('returns limited tool set for cheap tier', () => {
    const tools = coreToolsForTier('cheap');
    expect(tools).toEqual([
      'read_file',
      'search_files',
      'write_file',
      'edit_file',
      'terminal',
      'ask',
    ]);
  });

  it('returns wildcard for mid tier', () => {
    expect(coreToolsForTier('mid')).toEqual(['*']);
  });

  it('returns wildcard for frontier tier', () => {
    expect(coreToolsForTier('frontier')).toEqual(['*']);
  });

  it('returns wildcard for reasoning tier', () => {
    expect(coreToolsForTier('reasoning')).toEqual(['*']);
  });

  it('cheap tool set is a strict subset of frontier', () => {
    const cheap = coreToolsForTier('cheap');
    const frontier = coreToolsForTier('frontier');
    // frontier is ['*'] meaning "all tools", so cheap is a subset
    expect(frontier).toEqual(['*']);
    expect(cheap.length).toBeGreaterThan(0);
    expect(cheap).not.toEqual(['*']);
  });
});

describe('contextBudgetForTier', () => {
  it('returns correct budget for cheap tier', () => {
    const budget = contextBudgetForTier('cheap');
    expect(budget).toEqual({
      maxToolOutputChars: 1500,
      maxContextTokens: 32000,
      truncationChars: 120,
    });
  });

  it('returns correct budget for mid tier', () => {
    const budget = contextBudgetForTier('mid');
    expect(budget).toEqual({
      maxToolOutputChars: 4000,
      maxContextTokens: 120000,
      truncationChars: 200,
    });
  });

  it('returns correct budget for frontier tier', () => {
    const budget = contextBudgetForTier('frontier');
    expect(budget).toEqual({
      maxToolOutputChars: 8000,
      maxContextTokens: 200000,
      truncationChars: 200,
    });
  });

  it('reasoning tier matches frontier budget', () => {
    expect(contextBudgetForTier('reasoning')).toEqual(
      contextBudgetForTier('frontier'),
    );
  });

  it('budgets are ordered cheap < mid < frontier', () => {
    const cheap = contextBudgetForTier('cheap');
    const mid = contextBudgetForTier('mid');
    const frontier = contextBudgetForTier('frontier');

    expect(cheap.maxToolOutputChars).toBeLessThan(mid.maxToolOutputChars);
    expect(mid.maxToolOutputChars).toBeLessThan(frontier.maxToolOutputChars);

    expect(cheap.maxContextTokens).toBeLessThan(mid.maxContextTokens);
    expect(mid.maxContextTokens).toBeLessThan(frontier.maxContextTokens);

    expect(cheap.truncationChars).toBeLessThan(mid.truncationChars);
    expect(mid.truncationChars).toBe(frontier.truncationChars);
  });

  it('returns a fresh copy each call (no shared mutation)', () => {
    const a = contextBudgetForTier('cheap');
    const b = contextBudgetForTier('cheap');
    expect(a).toEqual(b);
    // Mutating a should not affect b
    (a as any).maxToolOutputChars = 9999;
    expect(b.maxToolOutputChars).toBe(1500);
  });
});
