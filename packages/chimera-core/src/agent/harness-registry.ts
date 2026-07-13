/**
 * Harness Registry
 *
 * Registry for agent harnesses (Claude Code, Codex, OpenCode, etc.).
 * Allows running the same agent definition across multiple backends.
 *
 * Modeled after Omnigent's multi-harness architecture.
 */

import type { ModelProvider } from '@chimera/providers';

export type HarnessType = 'chimera' | 'claude-code' | 'codex' | 'opencode' | 'pi' | 'hermes';

export interface HarnessRegistration {
  id: HarnessType;
  displayName: string;
  description?: string;
  /** Whether this harness requires a specific CLI to be installed */
  requiresCli?: string;
  /** Whether this harness supports session resume */
  supportsSessionResume: boolean;
  /** Whether this harness supports MCP */
  supportsMcp: boolean;
  /** Whether this harness supports hooks */
  supportsHooks: boolean;
  /** Factory to create a provider for this harness */
  factory: (config: HarnessConfig) => Promise<ModelProvider>;
}

export interface HarnessConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** Additional harness-specific options */
  options?: Record<string, unknown>;
}

export class HarnessRegistry {
  private harnesses = new Map<HarnessType, HarnessRegistration>();

  /**
   * Register a harness.
   */
  register(registration: HarnessRegistration): void {
    if (this.harnesses.has(registration.id)) {
      throw new Error(`Harness '${registration.id}' already registered`);
    }
    this.harnesses.set(registration.id, registration);
  }

  /**
   * Get a harness by ID.
   */
  get(id: HarnessType): HarnessRegistration | undefined {
    return this.harnesses.get(id);
  }

  /**
   * List all registered harnesses.
   */
  list(): HarnessRegistration[] {
    return Array.from(this.harnesses.values());
  }

  /**
   * Check if a harness is registered.
   */
  has(id: HarnessType): boolean {
    return this.harnesses.has(id);
  }

  /**
   * Remove a harness.
   */
  unregister(id: HarnessType): boolean {
    return this.harnesses.delete(id);
  }

  /**
   * Create a provider for a harness.
   */
  async createProvider(
    harnessId: HarnessType,
    config: HarnessConfig,
  ): Promise<ModelProvider> {
    const harness = this.harnesses.get(harnessId);
    if (!harness) {
      throw new Error(`Harness '${harnessId}' not found. Available: ${this.list().map(h => h.id).join(', ')}`);
    }
    return harness.factory(config);
  }

  /**
   * Get the default harness (chimera native).
   */
  getDefault(): HarnessRegistration | undefined {
    return this.harnesses.get('chimera');
  }
}

/**
 * Create a default harness registry with built-in harnesses.
 */
export function createDefaultHarnessRegistry(): HarnessRegistry {
  const registry = new HarnessRegistry();

  // Imported lazily to avoid a circular dependency with @chimera/providers.
  const makeOpenAIProvider = async (config: HarnessConfig, fallbackBaseUrl: string) => {
    const { OpenAICompatibleProvider } = await import('@chimera/providers');
    return new OpenAICompatibleProvider({
      baseUrl: config.baseUrl ?? fallbackBaseUrl,
      apiKey: config.apiKey ?? '',
      model: config.model ?? 'gpt-4o',
    });
  };

  // Chimera native harness
  registry.register({
    id: 'chimera',
    displayName: 'Chimera Native',
    description: 'Chimera\'s built-in multi-agent orchestrator',
    supportsSessionResume: true,
    supportsMcp: true,
    supportsHooks: true,
    factory: (config) => makeOpenAIProvider(config, 'https://api.openai.com/v1'),
  });

  // Hermes local gateway (OpenAI-compatible). Lets Chimera run on the same
  // backend this profile uses — the registry advertised it, now it exists.
  registry.register({
    id: 'hermes',
    displayName: 'Hermes Gateway',
    description: 'OpenAI-compatible Hermes gateway (custom provider)',
    requiresCli: 'hermes-gateway',
    supportsSessionResume: false,
    supportsMcp: false,
    supportsHooks: false,
    // ponytail: baseUrl default points at the local gateway; the harness is
    // HTTP-only. codex/claude-code/opencode need a subprocess provider and
    // sandbox — out of scope here, so they stay unregistered + honest errors.
    factory: (config) => makeOpenAIProvider(config, 'http://127.0.0.1:3000/v1'),
  });

  return registry;
}

