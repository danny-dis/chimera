import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProviderFactory } from '../provider-factory.js';
import { MockProvider } from '../providers/mock.js';
import { OpenAICompatibleProvider } from '../providers/openai-compatible.js';
import { AnthropicProvider } from '../providers/anthropic.js';

/**
 * MockProvider is used when:
 * - No real API keys are configured (automatic fallback)
 * - create('mock') is called explicitly
 *
 * When real keys are present, real providers are used regardless of CHIMERA_USE_MOCK.
 */
describe('ProviderFactory — mock provider behavior', () => {
  const originalEnv = process.env;
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const k of [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'GOOGLE_API_KEY',
      'OLLAMA_MODEL',
      'OLLAMA_HOST',
      'ANTHROPIC_MODEL',
      'OPENAI_MODEL',
      'GOOGLE_MODEL',
      'CHIMERA_USE_MOCK',
      'CHIMERA_CHEAP_API_KEY',
      'CHIMERA_CHEAP_BASE_URL',
      'CHIMERA_CHEAP_MODEL',
    ]) {
      delete process.env[k];
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-mock-optin-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  describe('automatic mock fallback', () => {
    it('returns MockProvider when no env vars and no config', () => {
      const providers = ProviderFactory.createFromEnv();
      expect(providers).toHaveLength(1);
      expect(providers[0]).toBeInstanceOf(MockProvider);
    });

    it('createSingle returns MockProvider when nothing is configured', () => {
      const provider = ProviderFactory.createSingle();
      expect(provider).toBeInstanceOf(MockProvider);
    });
  });

  describe('create("mock") explicit path', () => {
    it('ProviderFactory.create with provider="mock" returns a MockProvider', () => {
      const provider = ProviderFactory.create({
        name: 'test-mock',
        provider: 'mock',
        model: 'mock-default',
        apiKey: '',
        role: 'writer',
        constraints: {
          maxTokensPerTurn: 4096,
          costCapPerTask: 1,
          costCapPerSession: 10,
          costCapPerDay: 100,
          maxParallelInstances: 1,
          rateLimitRpm: 60,
        },
      });

      expect(provider).toBeInstanceOf(MockProvider);
      expect(provider.getModel().id).toBe('mock-default');
    });
  });

  describe('without mock opt-in', () => {
    it('createFromEnv does NOT return a MockProvider when real keys are set', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

      const providers = ProviderFactory.createFromEnv();
      expect(providers.some((p) => p instanceof MockProvider)).toBe(false);
      expect(providers.some((p) => p instanceof AnthropicProvider)).toBe(true);
    });

    it('createFromEnv with override does NOT silently fall back to a MockProvider', () => {
      const providers = ProviderFactory.createFromEnv({
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'override-key',
      });
      expect(providers[0]).toBeInstanceOf(OpenAICompatibleProvider);
    });
  });
});
