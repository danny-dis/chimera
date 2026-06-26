import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProviderFactory } from '../provider-factory.js';
import { AnthropicProvider } from '../providers/anthropic.js';
import { OpenAICompatibleProvider } from '../providers/openai-compatible.js';
import { OllamaProvider } from '../providers/ollama.js';
import { NoProviderConfiguredError } from '../errors.js';

/**
 * Quick-win 0.2: when env vars are absent, the factory should fall back
 * to `.chimera/config.yaml` for provider configs. This is friendlier than
 * requiring users to export env vars for every shell session.
 */
describe('ProviderFactory — .chimera/config.yaml fallback', () => {
  const originalEnv = process.env;
  const originalCwd = process.cwd();
  let tmpDir: string;
  let chimeraDir: string;
  let configPath: string;

  function writeConfig(yaml: string): void {
    fs.mkdirSync(chimeraDir, { recursive: true });
    fs.writeFileSync(configPath, yaml, 'utf-8');
  }

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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-cfg-fallback-'));
    chimeraDir = path.join(tmpDir, '.chimera');
    configPath = path.join(chimeraDir, 'config.yaml');
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

  it('uses config.yaml providers when env vars are absent', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-from-env';
    writeConfig(`
providers:
  - name: anthropic
    provider: anthropic
    model: claude-sonnet-4-20250514
    api_key: \${ANTHROPIC_API_KEY}
    role: writer
`);

    const providers = ProviderFactory.createFromEnv();
    expect(providers).toHaveLength(1);
    expect(providers[0]).toBeInstanceOf(AnthropicProvider);
    expect(providers[0].getModel().id).toBe('claude-sonnet-4-20250514');
  });

  it('resolves ${ENV_VAR} references inside config.yaml api_key fields', () => {
    process.env.OPENAI_API_KEY = 'openai-from-config';
    writeConfig(`
providers:
  - name: openai
    provider: openai
    model: gpt-4o
    api_key: \${OPENAI_API_KEY}
    role: writer
`);

    const providers = ProviderFactory.createFromEnv();
    expect(providers[0]).toBeInstanceOf(OpenAICompatibleProvider);
    expect(providers[0].getModel().id).toBe('gpt-4o');
  });

  it('reads multiple providers from a single config file', () => {
    process.env.ANTHROPIC_API_KEY = 'ant-key';
    process.env.OPENAI_API_KEY = 'oai-key';
    writeConfig(`
providers:
  - name: writer
    provider: anthropic
    model: claude-sonnet-4-20250514
    api_key: \${ANTHROPIC_API_KEY}
    role: writer
  - name: reviewer
    provider: openai
    model: gpt-4o
    api_key: \${OPENAI_API_KEY}
    role: reviewer
`);

    const providers = ProviderFactory.createFromEnv();
    expect(providers).toHaveLength(2);
    expect(providers.some((p) => p instanceof AnthropicProvider)).toBe(true);
    expect(providers.some((p) => p instanceof OpenAICompatibleProvider)).toBe(true);
  });

  it('handles Ollama entries without an api_key', () => {
    writeConfig(`
providers:
  - name: local
    provider: ollama
    model: llama3
    role: writer
`);

    const providers = ProviderFactory.createFromEnv();
    expect(providers).toHaveLength(1);
    expect(providers[0]).toBeInstanceOf(OllamaProvider);
    expect(providers[0].getModel().id).toBe('llama3');
  });

  it('env vars take precedence — config.yaml is only consulted when env is empty', () => {
    // Env: Anthropic
    process.env.ANTHROPIC_API_KEY = 'env-key';
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
    // Config: OpenAI (should be ignored because env produced a provider)
    process.env.OPENAI_API_KEY = 'config-key';
    writeConfig(`
providers:
  - name: openai
    provider: openai
    model: gpt-4o
    api_key: \${OPENAI_API_KEY}
    role: writer
`);

    const providers = ProviderFactory.createFromEnv();
    // Only the env-discovered provider should be present.
    expect(providers).toHaveLength(1);
    expect(providers[0]).toBeInstanceOf(AnthropicProvider);
  });

  it('createSingle() also falls back to config.yaml', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    writeConfig(`
providers:
  - name: primary
    provider: anthropic
    model: claude-sonnet-4-20250514
    api_key: \${ANTHROPIC_API_KEY}
    role: writer
`);

    const provider = ProviderFactory.createSingle();
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it('throws NoProviderConfiguredError when no env AND no config file', () => {
    expect(() => ProviderFactory.createFromEnv()).toThrow(NoProviderConfiguredError);
  });

  it('throws NoProviderConfiguredError when config file exists but is empty', () => {
    writeConfig('');
    expect(() => ProviderFactory.createFromEnv()).toThrow(NoProviderConfiguredError);
  });

  it('error message mentions the config file path that was checked', () => {
    try {
      ProviderFactory.createFromEnv();
      throw new Error('expected throw');
    } catch (err) {
      const e = err as NoProviderConfiguredError;
      // cross-platform: the path contains `.chimera` and ends with `config.yaml`
      const hasConfig = e.checkedLocations.some(
        (l) => l.includes('.chimera') && l.endsWith('config.yaml'),
      );
      expect(hasConfig).toBe(true);
    }
  });

  it('does NOT throw on config-file parse errors — falls through to the error', () => {
    // Malformed yaml: missing required `model`. The factory should skip
    // this entry and surface the consolidated NoProviderConfiguredError.
    writeConfig(`
providers:
  - name: broken
    provider: anthropic
    role: writer
`);
    expect(() => ProviderFactory.createFromEnv()).toThrow(NoProviderConfiguredError);
  });
});
