import { describe, it, expect } from 'vitest';
import { inferCapabilities, buildPool } from '../model-capabilities.js';

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
