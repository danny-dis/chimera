import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderFactory } from '../provider-factory.js';
import { OpenAICompatibleProvider } from '../providers/openai-compatible.js';
import { AnthropicProvider } from '../providers/anthropic.js';
import { GoogleProvider } from '../providers/google.js';
import { OllamaProvider } from '../providers/ollama.js';
import { InvalidConfigError } from '../errors.js';

describe('ProviderFactory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('create', () => {
    it('creates OpenAI-compatible provider from config', () => {
      const provider = ProviderFactory.create({
        name: 'test',
        provider: 'openai',
        baseUrl: 'https://api.openai.com',
        model: 'gpt-4o',
        apiKey: 'test-key',
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

      expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
      expect(provider.getModel().id).toBe('gpt-4o');
    });

    it('creates Anthropic provider from config', () => {
      const provider = ProviderFactory.create({
        name: 'test',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKey: 'test-key',
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

      expect(provider).toBeInstanceOf(AnthropicProvider);
      expect(provider.getModel().id).toBe('claude-sonnet-4-20250514');
    });

    it('creates Google provider from config', () => {
      const provider = ProviderFactory.create({
        name: 'test',
        provider: 'google',
        model: 'gemini-2.5-pro',
        apiKey: 'test-key',
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

      expect(provider).toBeInstanceOf(GoogleProvider);
    });

    it('creates Ollama provider from config', () => {
      const provider = ProviderFactory.create({
        name: 'test',
        provider: 'ollama',
        model: 'llama3',
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

      expect(provider).toBeInstanceOf(OllamaProvider);
    });

    it('throws on invalid config', () => {
      expect(() =>
        ProviderFactory.create({
          name: 'test',
          provider: 'openai',
          model: '',
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
        } as never),
      ).toThrow(InvalidConfigError);
    });
  });

  describe('createFromEnv', () => {
    it('discovers Anthropic provider from env', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

      const providers = ProviderFactory.createFromEnv();
      const anthropic = providers.find((p) => p.getModel().provider === 'anthropic');

      expect(anthropic).toBeDefined();
      expect(anthropic).toBeInstanceOf(AnthropicProvider);
    });

    it('discovers OpenAI provider from env', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OPENAI_MODEL = 'gpt-4o';

      const providers = ProviderFactory.createFromEnv();
      const openai = providers.find((p) => p.getModel().provider !== 'anthropic' && p.getModel().provider !== 'ollama' && p.getModel().provider !== 'google');

      expect(openai).toBeDefined();
      expect(openai).toBeInstanceOf(OpenAICompatibleProvider);
    });

    it('discovers Ollama provider without API key', () => {
      process.env.OLLAMA_MODEL = 'llama3';

      const providers = ProviderFactory.createFromEnv();
      const ollama = providers.find((p) => p.getModel().provider === 'ollama');

      expect(ollama).toBeDefined();
      expect(ollama).toBeInstanceOf(OllamaProvider);
    });

    it('returns only ollama when no API keys set', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.OLLAMA_MODEL;
      delete process.env.ANTHROPIC_MODEL;
      delete process.env.OPENAI_MODEL;
      delete process.env.GOOGLE_MODEL;

      const providers = ProviderFactory.createFromEnv();
      expect(providers).toHaveLength(0);
    });

    it('uses override when provided', () => {
      delete process.env.OLLAMA_MODEL;
      delete process.env.ANTHROPIC_MODEL;
      delete process.env.OPENAI_MODEL;
      delete process.env.GOOGLE_MODEL;

      const providers = ProviderFactory.createFromEnv({
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'override-key',
      });

      expect(providers).toHaveLength(1);
      expect(providers[0]).toBeInstanceOf(OpenAICompatibleProvider);
      expect(providers[0].getModel().id).toBe('gpt-4o-mini');
    });
  });

  describe('createSingle', () => {
    it('creates provider from override', () => {
      const provider = ProviderFactory.createSingle({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKey: 'test-key',
      });

      expect(provider).toBeInstanceOf(AnthropicProvider);
    });

    it('throws when no config available', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.OLLAMA_MODEL;
      delete process.env.ANTHROPIC_MODEL;
      delete process.env.OPENAI_MODEL;
      delete process.env.GOOGLE_MODEL;

      expect(() => ProviderFactory.createSingle()).toThrow(InvalidConfigError);
    });
  });
});
