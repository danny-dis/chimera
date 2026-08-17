/**
 * Preset system for Chimera — maps deliberation presets to alias compositions.
 *
 * A preset is a recipe that combines existing meta-model aliases into a
 * multi-agent deliberation pattern. Each role (writer, reviewer, challenger)
 * references an alias that the underlying provider (DMR-X, Ollama, Anthropic,
 * etc.) resolves independently.
 *
 * Design:
 *   - Presets are defined in .chimera/config.yaml under `presets:`
 *   - Each role in a preset references an alias (e.g. `auto-eco`, `auto-agentic`)
 *   - The alias is resolved by the provider configured for that role
 *   - Other providers (Ollama, Anthropic, OpenAI) work independently without DMR-X
 *   - The PresetEngine builds a DeliberationConfig from a preset + role overrides
 */

import type { DeliberationConfig, DeliberationMode } from './deliberation/types.js';
import type { ModelProvider, Message, CompletionOptions, CompletionResult, ModelInfo, PricingInfo } from '@chimera/providers';

/** Roles that can be assigned in a preset */
export type PresetRole = 'writer' | 'reviewer' | 'challenger' | 'judge' | 'decomposer' | 'worker' | 'merger' | 'voter';

/** How the agents in a preset execute */
export type PresetPattern = 'serial' | 'parallel' | 'panel' | 'decompose';

/**
 * A preset definition — maps roles to aliases.
 *
 * Each role references an alias string that the underlying provider resolves.
 * For DMR-X backends, these are meta-model aliases (`auto-eco`, `auto-agentic`, etc.).
 * For direct providers (Ollama, Anthropic, OpenAI), these are model IDs or undefined
 * (meaning "use the provider's default model").
 */
export interface PresetDefinition {
  /** Preset identifier (solo, duo, trio, fusion, hive, swarm) */
  id: DeliberationMode;
  /** Human-readable description */
  description: string;
  /** Role → alias mapping */
  roles: Partial<Record<PresetRole, string>>;
  /** Execution pattern */
  pattern: PresetPattern;
  /** Default budget cap in USD */
  budgetUsd?: number;
  /** Max recursion depth */
  maxDepth?: number;
}

/**
 * Resolved preset — a preset with all roles mapped to actual providers.
 * Produced by the PresetEngine, consumed by the DeliberationEngine.
 */
export interface ResolvedPreset {
  id: DeliberationMode;
  description: string;
  pattern: PresetPattern;
  budgetUsd?: number;
  maxDepth?: number;
  /** Role → resolved provider */
  providers: Partial<Record<PresetRole, ModelProvider>>;
  /** Role → alias that was resolved */
  aliases: Partial<Record<PresetRole, string>>;
}

/**
 * Provider resolver — resolves an alias to a concrete provider.
 * Different implementations for DMR-X, direct providers, etc.
 */
export interface AliasResolver {
  /** The backend this resolver handles (e.g. 'dmr-x', 'ollama', 'anthropic') */
  readonly backend: string;
  /** Resolve an alias to a provider. Returns undefined if not handled. */
  resolve(alias: string): Promise<ModelProvider | undefined>;
}

/**
 * PresetEngine — resolves presets to DeliberationConfigs.
 *
 * It takes a preset definition, resolves each role's alias to a provider,
 * and builds the appropriate DeliberationConfig for the DeliberationEngine.
 */
export class PresetEngine {
  private resolvers: AliasResolver[] = [];

  constructor(resolvers?: AliasResolver[]) {
    if (resolvers) this.resolvers = resolvers;
  }

  /** Register an alias resolver */
  register(resolver: AliasResolver): void {
    this.resolvers.push(resolver);
  }

  /**
   * Resolve a preset to a DeliberationConfig.
   *
   * @param preset - The preset definition
   * @param roleOverrides - Optional per-role alias overrides
   * @returns Resolved deliberation config
   */
  async resolve(
    preset: PresetDefinition,
    roleOverrides?: Partial<Record<PresetRole, string>>,
  ): Promise<DeliberationConfig> {
    const providers: Partial<Record<PresetRole, ModelProvider>> = {};
    const aliases: Partial<Record<PresetRole, string>> = {};

    // Resolve each role's alias to a provider
    for (const [role, alias] of Object.entries(preset.roles)) {
      const effectiveAlias = roleOverrides?.[role as PresetRole] ?? alias;
      if (!effectiveAlias) continue;

      const provider = await this.resolveAlias(effectiveAlias);
      if (provider) {
        providers[role as PresetRole] = provider;
        aliases[role as PresetRole] = effectiveAlias;
      }
    }

    return this.buildConfig(preset, providers, aliases);
  }

  /**
   * Resolve an alias to a provider using registered resolvers.
   */
  private async resolveAlias(alias: string): Promise<ModelProvider | undefined> {
    for (const resolver of this.resolvers) {
      try {
        const provider = await resolver.resolve(alias);
        if (provider) return provider;
      } catch {
        // Resolver failed — try next one
      }
    }
    return undefined;
  }

  /**
   * Build a DeliberationConfig from resolved providers.
   */
  private buildConfig(
    preset: PresetDefinition,
    providers: Partial<Record<PresetRole, ModelProvider>>,
    aliases: Partial<Record<PresetRole, string>>,
  ): DeliberationConfig {
    const base = {
      task: '', // Filled in by caller
      budgetUsd: preset.budgetUsd,
      maxDepth: preset.maxDepth ?? 1,
    };

    switch (preset.id) {
      case 'solo':
        return {
          ...base,
          mode: 'solo',
          model: aliases.writer ?? 'default',
        };

      case 'duo':
        return {
          ...base,
          mode: 'duo',
          modelA: aliases.writer ?? 'default',
          modelB: aliases.reviewer ?? aliases.writer ?? 'default',
        };

      case 'trio':
        return {
          ...base,
          mode: 'trio',
          writer: aliases.writer ?? 'default',
          reviewer: aliases.reviewer ?? aliases.writer ?? 'default',
          challenger: aliases.challenger ?? aliases.reviewer ?? aliases.writer ?? 'default',
        };

      case 'fusion':
        return {
          ...base,
          mode: 'fusion',
          analysisModels: [
            aliases.writer ?? 'default',
            aliases.reviewer ?? aliases.writer ?? 'default',
            aliases.challenger ?? aliases.reviewer ?? aliases.writer ?? 'default',
          ].filter((v, i, a) => a.indexOf(v) === i), // dedupe
          judgeModel: aliases.judge ?? aliases.reviewer ?? 'default',
        };

      case 'hive':
        return {
          ...base,
          mode: 'hive',
          models: [
            aliases.worker ?? aliases.writer ?? 'default',
          ],
          mergeModel: aliases.merger ?? aliases.judge ?? aliases.reviewer ?? 'default',
        };

      case 'swarm':
        return {
          ...base,
          mode: 'swarm',
          maxAgents: 10,
          maxConcurrency: 5,
        };

      case 'auto':
        return {
          ...base,
          mode: 'auto',
        };

      default:
        return {
          ...base,
          mode: 'solo',
          model: aliases.writer ?? 'default',
        };
    }
  }
}

/**
 * Built-in presets — the default library.
 * Each preset composes aliases into a deliberation pattern.
 */
export const BUILT_IN_PRESETS: PresetDefinition[] = [
  {
    id: 'solo',
    description: 'Single agent, no verification',
    roles: { writer: 'auto' },
    pattern: 'serial',
  },
  {
    id: 'duo',
    description: 'Writer drafts, reviewer verifies',
    roles: { writer: 'auto-eco', reviewer: 'auto-agentic' },
    pattern: 'serial',
  },
  {
    id: 'trio',
    description: 'Writer drafts, reviewer verifies, challenger attacks',
    roles: { writer: 'auto-eco', reviewer: 'auto-agentic', challenger: 'auto-reasoning' },
    pattern: 'serial',
  },
  {
    id: 'fusion',
    description: 'Multi-model panel + judge picks best',
    roles: { writer: 'auto-eco', reviewer: 'auto-agentic', challenger: 'auto-reasoning', judge: 'auto-smart' },
    pattern: 'panel',
  },
  {
    id: 'hive',
    description: 'Decompose → parallel workers → merge',
    roles: { decomposer: 'auto', worker: 'auto-coding', merger: 'auto-smart' },
    pattern: 'decompose',
  },
  {
    id: 'swarm',
    description: 'Many cheap attempts, vote for best',
    roles: { voter: 'auto' },
    pattern: 'parallel',
  },
  {
    id: 'auto',
    description: 'Let the preset router decide based on task complexity',
    roles: {},
    pattern: 'serial',
  },
];

/**
 * Get a built-in preset by ID.
 */
export function getBuiltInPreset(id: DeliberationMode): PresetDefinition | undefined {
  return BUILT_IN_PRESETS.find(p => p.id === id);
}
