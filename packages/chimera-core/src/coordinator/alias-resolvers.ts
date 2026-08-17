/**
 * Alias resolver implementations.
 *
 * Each resolver handles a specific backend:
 *   - DmrxAliasResolver: resolves meta-model aliases through DMR-X using ProviderFactory
 *   - DirectAliasResolver: resolves model IDs directly (Ollama, Anthropic, etc.)
 *
 * This lets Chimera use DMR-X aliases in presets while still supporting
 * independent providers that work without DMR-X.
 */

import { ProviderFactory } from '@chimera/providers';
import type { ModelProvider } from '@chimera/providers';
import type { AliasResolver, PresetRole } from './preset-engine.js';

/**
 * Resolves aliases through DMR-X.
 *
 * DMR-X acts as a gateway that resolves meta-model aliases (auto-eco, auto-agentic, etc.)
 * to concrete provider/model pairs. This resolver uses ProviderFactory to create
 * a real provider that talks to DMR-X's OpenAI-compatible endpoint.
 */
export class DmrxAliasResolver implements AliasResolver {
  readonly backend = 'dmr-x';

  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey = 'dummy') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  async resolve(alias: string): Promise<ModelProvider | undefined> {
    // Use ProviderFactory to create a real provider for DMR-X.
    // DMR-X is OpenAI-compatible, so we use the openai-compatible provider type.
    // The alias (e.g. "auto-eco", "auto-agentic") is passed as the model name,
    // and DMR-X resolves it server-side to the actual provider/model.
    return ProviderFactory.create({
      name: `dmr-x-${alias}`,
      provider: 'openai-compatible',
      model: alias,
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      timeoutMs: 120_000,
      role: 'writer',
      constraints: {
        maxTokensPerTurn: 4096,
        costCapPerTask: 10,
        costCapPerSession: 20,
        costCapPerDay: 50,
        maxParallelInstances: 1,
        rateLimitRpm: 60,
      },
    });
  }
}

/**
 * Resolves model IDs directly (no alias resolution).
 * Used for providers that work independently without DMR-X.
 */
export class DirectAliasResolver implements AliasResolver {
  readonly backend = 'direct';

  private readonly providerFactory: (modelId: string) => Promise<ModelProvider | undefined>;

  constructor(
    providerFactory: (modelId: string) => Promise<ModelProvider | undefined>,
  ) {
    this.providerFactory = providerFactory;
  }

  async resolve(modelId: string): Promise<ModelProvider | undefined> {
    return this.providerFactory(modelId);
  }
}

/**
 * Detect which alias resolver to use based on the config.
 *
 * If the backend is DMR-X, returns a DmrxAliasResolver.
 * Otherwise returns a DirectAliasResolver that uses the configured provider.
 */
export function createAliasResolverFromConfig(config: {
  backend?: string;
  baseUrl?: string;
  apiKey?: string;
}): AliasResolver {
  if (config.backend === 'dmr-x' || config.baseUrl?.includes('47113')) {
    return new DmrxAliasResolver(config.baseUrl ?? 'http://127.0.0.1:47113/v1', config.apiKey ?? 'dummy');
  }

  return new DirectAliasResolver(async () => undefined);
}
