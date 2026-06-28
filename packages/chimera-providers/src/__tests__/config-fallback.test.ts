import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProviderFactory } from '../provider-factory.js';
import { AnthropicProvider } from '../providers/anthropic.js';
import { OpenAICompatibleProvider } from '../providers/openai-compatible.js';
import { OllamaProvider } from '../providers/ollama.js';
import { MockProvider } from '../providers/mock.js';

/**
 * ProviderFactory.createFromEnv discovers providers from environment variables.
 * Config.yaml fallback is handled by the CLI's config-loader, not by the factory.
 * When no env vars are set, the factory returns a MockProvider.
 */
describe('ProviderFactory — environment variable discovery', () => {
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-cfg-fallback-'));
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

  it('creates AnthropicProvider from env vars', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-from-env';
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

    const providers = ProviderFactory.createFromEnv();
    expect(providers).toHaveLength(1);
    expect(providers[0]).toBeInstanceOf(AnthropicProvider);
    expect(providers[0].getModel().id).toBe('claude-sonnet-4-20250514');
  });

  it('creates OpenAI provider from env vars', () => {
    process.env.OPENAI_API_KEY = 'openai-from-env';
    process.env.OPENAI_MODEL = 'gpt-4o';

    const providers = ProviderFactory.createFromEnv();
    expect(providers[0]).toBeInstanceOf(OpenAICompatibleProvider);
    expect(providers[0].getModel().id).toBe('gpt-4o');
  });

  it('discovers multiple providers from env vars', () => {
    process.env.ANTHROPIC_API_KEY = 'ant-key';
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
    process.env.OPENAI_API_KEY = 'oai-key';
    process.env.OPENAI_MODEL = 'gpt-4o';

    const providers = ProviderFactory.createFromEnv();
    expect(providers.length).toBeGreaterThanOrEqual(2);
    expect(providers.some((p) => p instanceof AnthropicProvider)).toBe(true);
    expect(providers.some((p) => p instanceof OpenAICompatibleProvider)).toBe(true);
  });

  it('returns MockProvider when no env vars are set', () => {
    const providers = ProviderFactory.createFromEnv();
    expect(providers).toHaveLength(1);
    expect(providers[0]).toBeInstanceOf(MockProvider);
  });

  it('createSingle() returns MockProvider when nothing is configured', () => {
    const provider = ProviderFactory.createSingle();
    expect(provider).toBeInstanceOf(MockProvider);
  });

  it('env vars take precedence — multiple providers discovered from env', () => {
    process.env.ANTHROPIC_API_KEY = 'env-key';
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

    const providers = ProviderFactory.createFromEnv();
    expect(providers).toHaveLength(1);
    expect(providers[0]).toBeInstanceOf(AnthropicProvider);
  });
});
