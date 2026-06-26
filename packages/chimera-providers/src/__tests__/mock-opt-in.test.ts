import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProviderFactory } from '../provider-factory.js';
import { MockProvider } from '../providers/mock.js';
import { OpenAICompatibleProvider } from '../providers/openai-compatible.js';
import { AnthropicProvider } from '../providers/anthropic.js';

/**
 * Quick-win 0.2: the MockProvider must remain reachable, but only when
 * the caller explicitly opts in — either via `create('mock')` or via the
 * `CHIMERA_USE_MOCK=1` debug env flag. The factory must never fall back
 * to a mock implicitly.
 */
describe('ProviderFactory — explicit mock opt-in', () => {
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

  describe('CHIMERA_USE_MOCK=1', () => {
    it('createFromEnv returns a single MockProvider without consulting env or config', () => {
      process.env.CHIMERA_USE_MOCK = '1';
      // Even with real keys set, the flag wins.
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

      const providers = ProviderFactory.createFromEnv();
      expect(providers).toHaveLength(1);
      expect(providers[0]).toBeInstanceOf(MockProvider);
    });

    it('createFromEnv returns a MockProvider when no env vars and no config', () => {
      process.env.CHIMERA_USE_MOCK = '1';
      const providers = ProviderFactory.createFromEnv();
      expect(providers).toHaveLength(1);
      expect(providers[0]).toBeInstanceOf(MockProvider);
    });

    it('createSingle returns a MockProvider when flag is set', () => {
      process.env.CHIMERA_USE_MOCK = '1';
      const provider = ProviderFactory.createSingle();
      expect(provider).toBeInstanceOf(MockProvider);
    });

    it('flag value must be the string "1" (other truthy values are ignored)', () => {
      process.env.CHIMERA_USE_MOCK = 'true';
      expect(() => ProviderFactory.createFromEnv()).toThrow(/No LLM provider configured/);
    });
  });

  describe('create("mock") explicit path', () => {
    it('ProviderFactory.create with provider="mock" returns a MockProvider', () => {
      // We exercise the "mock" branch via buildProvider by passing a
      // config with provider='mock'. This is the only way to get a mock
      // without the env flag.
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

  describe('without opt-in', () => {
    it('createFromEnv does NOT return a MockProvider when real keys are set', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

      const providers = ProviderFactory.createFromEnv();
      expect(providers.some((p) => p instanceof MockProvider)).toBe(false);
      expect(providers.some((p) => p instanceof AnthropicProvider)).toBe(true);
    });

    it('createFromEnv with override does NOT silently fall back to a MockProvider', () => {
      // Override is given, so it should be used — no fallback needed.
      const providers = ProviderFactory.createFromEnv({
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'override-key',
      });
      expect(providers[0]).toBeInstanceOf(OpenAICompatibleProvider);
    });
  });
});
