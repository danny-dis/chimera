import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PresetEngine, BUILT_IN_PRESETS, getBuiltInPreset } from '../preset-engine.js';
import type { AliasResolver, PresetRole } from '../preset-engine.js';
import type { ModelProvider } from '@chimera/providers';

// Mock provider factory
const createMockProvider = (id: string): ModelProvider => ({
  complete: vi.fn().mockResolvedValue({ content: `response from ${id}`, finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 20 } }),
  stream: vi.fn(),
  getModel: vi.fn().mockReturnValue({ id, name: id, provider: 'mock', contextWindow: 128000, maxOutputTokens: 8192 }),
  getContextWindow: vi.fn().mockReturnValue(128000),
  getMaxOutputTokens: vi.fn().mockReturnValue(8192),
  getCost: vi.fn().mockReturnValue(0),
  getPricing: vi.fn().mockReturnValue({ inputPerMillion: 0, outputPerMillion: 0 }),
  getCapabilities: vi.fn().mockReturnValue({ toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: true }),
  supportsToolCalling: vi.fn().mockReturnValue(true),
  supportsStructuredOutput: vi.fn().mockReturnValue(true),
  supportsVision: vi.fn().mockReturnValue(false),
  supportsReasoning: vi.fn().mockReturnValue(false),
  countTokens: vi.fn().mockReturnValue(100),
  countTokensForMessages: vi.fn().mockReturnValue(100),
});

// Mock resolver
const createMockResolver = (aliases: Record<string, string>, backend = 'mock'): AliasResolver => ({
  backend,
  resolve: vi.fn(async (alias: string) => {
    if (aliases[alias]) {
      return createMockProvider(aliases[alias]);
    }
    return undefined;
  }),
});

describe('PresetEngine', () => {
  describe('resolve', () => {
    it('resolves a duo preset with writer and reviewer aliases', async () => {
      const resolver = createMockResolver({ 'auto-eco': 'cheap-model', 'auto-agentic': 'agentic-model' });
      const engine = new PresetEngine([resolver]);

      const preset = getBuiltInPreset('duo')!;
      const config = await engine.resolve(preset);

      expect(config.mode).toBe('duo');
      expect(config.task).toBe('');
      expect(resolver.resolve).toHaveBeenCalledWith('auto-eco');
      expect(resolver.resolve).toHaveBeenCalledWith('auto-agentic');
    });

    it('resolves a trio preset with writer, reviewer, and challenger aliases', async () => {
      const resolver = createMockResolver({
        'auto-eco': 'cheap-model',
        'auto-agentic': 'agentic-model',
        'auto-reasoning': 'reasoning-model',
      });
      const engine = new PresetEngine([resolver]);

      const preset = getBuiltInPreset('trio')!;
      const config = await engine.resolve(preset);

      expect(config.mode).toBe('trio');
      expect(resolver.resolve).toHaveBeenCalledWith('auto-eco');
      expect(resolver.resolve).toHaveBeenCalledWith('auto-agentic');
      expect(resolver.resolve).toHaveBeenCalledWith('auto-reasoning');
    });

    it('applies role overrides', async () => {
      const resolver = createMockResolver({
        'auto-eco': 'cheap-model',
        'custom-reviewer': 'custom-model',
      });
      const engine = new PresetEngine([resolver]);

      const preset = getBuiltInPreset('duo')!;
      const config = await engine.resolve(preset, { reviewer: 'custom-reviewer' });

      expect(config.mode).toBe('duo');
      expect(resolver.resolve).toHaveBeenCalledWith('auto-eco');
      expect(resolver.resolve).toHaveBeenCalledWith('custom-reviewer');
      expect(resolver.resolve).not.toHaveBeenCalledWith('auto-agentic');
    });

    it('falls back to second resolver when first returns undefined', async () => {
      const resolver1 = createMockResolver({}, 'empty');
      const resolver2 = createMockResolver({ 'auto-eco': 'fallback-model' }, 'fallback');
      const engine = new PresetEngine([resolver1, resolver2]);

      const preset = getBuiltInPreset('solo')!;
      const config = await engine.resolve(preset);

      expect(config.mode).toBe('solo');
      expect(resolver1.resolve).toHaveBeenCalledWith('auto');
      expect(resolver2.resolve).toHaveBeenCalledWith('auto');
    });
  });

  describe('BUILT_IN_PRESETS', () => {
    it('contains all 7 presets', () => {
      expect(BUILT_IN_PRESETS).toHaveLength(7);
      const ids = BUILT_IN_PRESETS.map(p => p.id);
      expect(ids).toEqual(['solo', 'duo', 'trio', 'fusion', 'hive', 'swarm', 'auto']);
    });

    it('duo preset maps writer to auto-eco and reviewer to auto-agentic', () => {
      const duo = getBuiltInPreset('duo')!;
      expect(duo.roles.writer).toBe('auto-eco');
      expect(duo.roles.reviewer).toBe('auto-agentic');
      expect(duo.pattern).toBe('serial');
    });

    it('trio preset maps writer to auto-eco, reviewer to auto-agentic, challenger to auto-reasoning', () => {
      const trio = getBuiltInPreset('trio')!;
      expect(trio.roles.writer).toBe('auto-eco');
      expect(trio.roles.reviewer).toBe('auto-agentic');
      expect(trio.roles.challenger).toBe('auto-reasoning');
    });

    it('fusion preset maps all 4 roles', () => {
      const fusion = getBuiltInPreset('fusion')!;
      expect(fusion.roles.writer).toBe('auto-eco');
      expect(fusion.roles.reviewer).toBe('auto-agentic');
      expect(fusion.roles.challenger).toBe('auto-reasoning');
      expect(fusion.roles.judge).toBe('auto-smart');
      expect(fusion.pattern).toBe('panel');
    });
  });

  describe('getBuiltInPreset', () => {
    it('returns undefined for unknown preset', () => {
      expect(getBuiltInPreset('unknown' as any)).toBeUndefined();
    });

    it('returns the correct preset by id', () => {
      expect(getBuiltInPreset('solo')?.id).toBe('solo');
      expect(getBuiltInPreset('duo')?.id).toBe('duo');
      expect(getBuiltInPreset('trio')?.id).toBe('trio');
    });
  });
});

describe('DmrxAliasResolver', () => {
  it('has backend = dmr-x', async () => {
    const { DmrxAliasResolver } = await import('../alias-resolvers.js');
    const resolver = new DmrxAliasResolver('http://localhost:47113/v1');
    expect(resolver.backend).toBe('dmr-x');
  });
});

describe('DirectAliasResolver', () => {
  it('delegates to provider factory', async () => {
    const { DirectAliasResolver } = await import('../alias-resolvers.js');
    const factory = vi.fn(async (id: string) => createMockProvider(id));
    const resolver = new DirectAliasResolver(factory);

    const provider = await resolver.resolve('llama-70b');
    expect(provider).toBeDefined();
    expect(factory).toHaveBeenCalledWith('llama-70b');
  });

  it('returns undefined when factory returns undefined', async () => {
    const { DirectAliasResolver } = await import('../alias-resolvers.js');
    const factory = vi.fn(async (_id: string) => undefined);
    const resolver = new DirectAliasResolver(factory);

    const provider = await resolver.resolve('unknown');
    expect(provider).toBeUndefined();
  });
});
