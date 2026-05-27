import { z } from 'zod';
import { ProviderConfig, ProviderConfigSchema } from './model-adapter.js';
import { ModelProvider } from './types/provider.js';
import { InvalidConfigError } from './errors.js';
import { OpenAICompatibleProvider, OpenAICompatibleConfig } from './providers/openai-compatible.js';
import { AnthropicProvider, AnthropicConfig } from './providers/anthropic.js';
import { GoogleProvider, GoogleConfig } from './providers/google.js';
import { OllamaProvider, OllamaConfig } from './providers/ollama.js';

const ProviderTypeSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'ollama',
  'openai-compatible',
]);

const EnvProviderConfigSchema = z.object({
  provider: ProviderTypeSchema,
  model: z.string(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  projectId: z.string().optional(),
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
    'openai-compatible': 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_API_KEY',
  };

  const envKey = keyMap[config.provider];
  const key = envKey ? getEnv(envKey) : undefined;

  if (!key) {
    throw new InvalidConfigError(
      `No API key provided for ${config.provider}. Set ${envKey} or pass apiKey in config.`,
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

    return providers;
  }

  static createSingle(overrides?: Partial<EnvProviderConfig>): ModelProvider {
    const candidates = this.discoverEnvConfigs(overrides);

    if (candidates.length === 0) {
      throw new InvalidConfigError(
        'No provider configuration found. Set environment variables or pass config.',
      );
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
        };
        return new AnthropicProvider(anthropicConfig);
      }

      case 'google': {
        const googleConfig: GoogleConfig = {
          apiKey: resolveApiKey(config),
          model: config.model,
          projectId: config.projectId,
        };
        return new GoogleProvider(googleConfig);
      }

      case 'ollama': {
        const ollamaConfig: OllamaConfig = {
          baseUrl: resolveBaseUrl(config),
          model: config.model,
        };
        return new OllamaProvider(ollamaConfig);
      }

      case 'openai':
      case 'openai-compatible': {
        const openaiConfig: OpenAICompatibleConfig = {
          baseUrl: resolveBaseUrl(config),
          apiKey: resolveApiKey(config),
          model: config.model,
        };
        return new OpenAICompatibleProvider(openaiConfig);
      }

      default:
        throw new InvalidConfigError(
          `Unknown provider type: ${config.provider}`,
          config.provider,
        );
    }
  }
}
