import { z } from 'zod';
import { ProviderConfig, ProviderConfigSchema } from './model-adapter.js';
import { ModelProvider } from './types/provider.js';
import { InvalidConfigError } from './errors.js';
import { OpenAICompatibleProvider, OpenAICompatibleConfig } from './providers/openai-compatible.js';
import { AnthropicProvider, AnthropicConfig } from './providers/anthropic.js';
import { GoogleProvider, GoogleConfig } from './providers/google.js';
import { OllamaProvider, OllamaConfig } from './providers/ollama.js';
import { createDefaultMockProvider } from './providers/mock.js';

const ProviderTypeSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'ollama',
  'openai-compatible',
  'mock',
]);

const EnvProviderConfigSchema = z.object({
  provider: ProviderTypeSchema,
  model: z.string(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  projectId: z.string().optional(),
  timeoutMs: z.number().positive().optional(),
});

type EnvProviderConfig = z.infer<typeof EnvProviderConfigSchema>;

function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

function resolveApiKey(config: EnvProviderConfig): string {
  if (config.apiKey) return config.apiKey;

  const keyMap: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    // 'openai-compatible' intentionally omitted — each compatible provider
    // (NVIDIA NIM, Mistral, OpenRouter, etc.) has its own API key.
    // Falling back to OPENAI_API_KEY caused cross-provider key leakage.
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_API_KEY',
  };

  const envKey = keyMap[config.provider];
  const key = envKey ? getEnv(envKey) : undefined;

  if (!key) {
    throw new InvalidConfigError(
      `No API key provided for ${config.provider}. Set ${envKey ?? 'apiKey'} in your provider config or environment.`,
      config.provider,
    );
  }

  return key;
}

function resolveBaseUrl(config: EnvProviderConfig): string {
  if (config.baseUrl) return config.baseUrl;

  const urlMap: Record<string, string | undefined> = {
    openai: 'https://api.openai.com',
    anthropic: 'https://api.anthropic.com',
    google: 'https://generativelanguage.googleapis.com',
    ollama: 'http://localhost:11434',
  };

  const url = urlMap[config.provider];
  if (!url) {
    throw new InvalidConfigError(
      `No default base URL for provider: ${config.provider}`,
      config.provider,
    );
  }

  return url;
}

export class ProviderFactory {
  static create(config: ProviderConfig): ModelProvider {
    const parsed = ProviderConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new InvalidConfigError(
        `Invalid provider config: ${parsed.error.message}`,
        config.provider,
      );
    }

    return this.buildProvider({
      provider: config.provider as EnvProviderConfig['provider'],
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      timeoutMs: config.timeoutMs,
    });
  }

  static createFromEnv(overrides?: Partial<EnvProviderConfig>): ModelProvider[] {
    const providers: ModelProvider[] = [];
    const candidates = this.discoverEnvConfigs(overrides);

    for (const candidate of candidates) {
      try {
        const provider = this.buildProvider(candidate);
        providers.push(provider);
      } catch {
        // Skip providers with missing credentials
      }
    }

    // If no real provider could be built, fall back to the offline MockProvider
    // so CLI smoke tests and "first run" experience still work without keys.
    if (providers.length === 0) {
      providers.push(createDefaultMockProvider());
    }

    return providers;
  }

  /**
   * Convenience: build a single provider from env, or fall back to a mock.
   * Use this when you need exactly one provider and don't want to handle
   * the "no config" error case.
   */
  static createFromEnvOrMock(overrides?: Partial<EnvProviderConfig>): ModelProvider {
    const providers = this.createFromEnv(overrides);
    return providers[0];
  }

  static createSingle(overrides?: Partial<EnvProviderConfig>): ModelProvider {
    const candidates = this.discoverEnvConfigs(overrides);

    if (candidates.length === 0) {
      // No real provider configured — fall back to the offline mock so the CLI
      // can still run end-to-end (useful for CI, dev, and "first run" UX).
      return createDefaultMockProvider();
    }

    return this.buildProvider(candidates[0]);
  }

  private static discoverEnvConfigs(overrides?: Partial<EnvProviderConfig>): EnvProviderConfig[] {
    const configs: EnvProviderConfig[] = [];

    const providerConfigs: { provider: string; modelEnv: string; baseUrl?: string }[] = [
      { provider: 'anthropic', modelEnv: 'ANTHROPIC_MODEL', baseUrl: 'https://api.anthropic.com' },
      { provider: 'openai', modelEnv: 'OPENAI_MODEL', baseUrl: 'https://api.openai.com' },
      { provider: 'google', modelEnv: 'GOOGLE_MODEL', baseUrl: 'https://generativelanguage.googleapis.com' },
      { provider: 'ollama', modelEnv: 'OLLAMA_MODEL', baseUrl: 'http://localhost:11434' },
    ];

    for (const pc of providerConfigs) {
      const model = getEnv(pc.modelEnv);
      const apiKey = pc.provider === 'ollama' ? undefined : getEnv(`${pc.provider.toUpperCase()}_API_KEY`);

      if (model) {
        configs.push({
          provider: pc.provider as EnvProviderConfig['provider'],
          model,
          baseUrl: pc.baseUrl,
          apiKey: apiKey ?? undefined,
        });
      }
    }

    if (overrides) {
      const merged: EnvProviderConfig = {
        provider: overrides.provider ?? configs[0]?.provider ?? 'openai',
        model: overrides.model ?? configs[0]?.model ?? 'gpt-4o',
        baseUrl: overrides.baseUrl,
        apiKey: overrides.apiKey,
        projectId: overrides.projectId,
      };
      configs.unshift(merged);
    }

    return configs;
  }

  private static buildProvider(config: EnvProviderConfig): ModelProvider {
    const parsed = EnvProviderConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new InvalidConfigError(
        `Invalid env config: ${parsed.error.message}`,
        config.provider,
      );
    }

    switch (config.provider) {
      case 'anthropic': {
        const anthropicConfig: AnthropicConfig = {
          apiKey: resolveApiKey(config),
          model: config.model,
          options: { timeoutMs: config.timeoutMs },
        };
        return new AnthropicProvider(anthropicConfig);
      }

      case 'google': {
        const googleConfig: GoogleConfig = {
          apiKey: resolveApiKey(config),
          model: config.model,
          projectId: config.projectId,
          options: { timeoutMs: config.timeoutMs },
        };
        return new GoogleProvider(googleConfig);
      }

      case 'ollama': {
        const ollamaConfig: OllamaConfig = {
          baseUrl: resolveBaseUrl(config),
          model: config.model,
          options: { timeoutMs: config.timeoutMs },
        };
        return new OllamaProvider(ollamaConfig);
      }

      case 'openai':
      case 'openai-compatible': {
        const openaiConfig: OpenAICompatibleConfig = {
          baseUrl: resolveBaseUrl(config),
          apiKey: resolveApiKey(config),
          model: config.model,
          options: { timeoutMs: config.timeoutMs },
        };
        return new OpenAICompatibleProvider(openaiConfig);
      }

      case 'mock': {
        return createDefaultMockProvider();
      }

      default:
        throw new InvalidConfigError(
          `Unknown provider type: ${config.provider}`,
          config.provider,
        );
    }
  }
}

/**
 * Fetch available model IDs from a provider's API.
 * Returns model ID strings, or an empty array on failure.
 */
export async function listModels(provider: string, apiKey: string): Promise<string[]> {
  try {
    switch (provider) {
      case 'openai':
        return await listOpenAIModels(apiKey);
      case 'google':
        return await listGoogleModels(apiKey);
      case 'anthropic':
        return listAnthropicModels();
      case 'ollama':
        return await listOllamaModels();
      default:
        return [];
    }
  } catch {
    return [];
  }
}

async function listOpenAIModels(apiKey: string): Promise<string[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const data = await res.json() as { data?: Array<{ id: string }> };
  return (data.data ?? [])
    .map((m) => m.id)
    .filter((id) => id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4'));
}

async function listGoogleModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const data = await res.json() as { models?: Array<{ name: string }> };
  return (data.models ?? [])
    .map((m) => m.name.replace('models/', ''))
    .filter((id) => id.startsWith('gemini-'));
}

function listAnthropicModels(): string[] {
  return [
    'claude-opus-4-20250514',
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
  ];
}

async function listOllamaModels(): Promise<string[]> {
  const res = await fetch('http://localhost:11434/api/tags', {
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) return [];
  const data = await res.json() as { models?: Array<{ name: string }> };
  return (data.models ?? []).map((m) => m.name);
}

// ── Default Model Registry ───────────────────────────────────────────────

import { ModelRegistry } from './model-registry.js';

let defaultRegistry: ModelRegistry | null = null;

/**
 * Get the default ModelRegistry instance.
 * The registry automatically loads cached model metadata from disk on construction.
 * This provides a singleton registry with dynamically updated context windows and pricing.
 * 
 * @example
 * ```typescript
 * import { getDefaultRegistry } from '@chimera/providers';
 * 
 * const registry = getDefaultRegistry();
 * const model = registry.get('anthropic/claude-sonnet-4-20250514');
 * console.log(model?.contextWindow); // Uses cached value if available
 * 
 * // Refresh from API
 * await registry.refreshFromAPI();
 * ```
 */
export function getDefaultRegistry(): ModelRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new ModelRegistry(); // Auto-loads cache in constructor
  }
  return defaultRegistry;
}

/**
 * Reset the default registry (useful for testing).
 */
export function resetDefaultRegistry(): void {
  defaultRegistry = null;
}
