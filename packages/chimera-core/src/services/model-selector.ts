import { SimpleModelRegistry } from '@chimera/providers';
import type { ModelRegistry, ModelEntry } from '@chimera/providers';
import type { ModelCapability, ModelHealth, ModelTier } from '@chimera/domain';

/**
 * ModelSelector — provider-neutral model selection.
 * Wraps SimpleModelRegistry with domain types and selection logic.
 */
export class ModelSelector {
  private registry: ModelRegistry;
  private healthCache: Map<string, ModelHealth> = new Map();

  constructor(registry?: ModelRegistry) {
    this.registry = registry ?? new SimpleModelRegistry();
  }

  /**
   * Select the best model for a role given requirements.
   */
  selectForRole(role: string, requirements: {
    minTier?: string;
    requiredCapabilities?: string[];
    maxCostPerMillion?: number;
    preferLocal?: boolean;
  }): ModelCapability | null {
    const models = this.registry.getAll();
    if (models.length === 0) return null;

    const tierRank: Record<string, number> = { cheap: 0, mid: 1, frontier: 2, reasoning: 3, local: 4 };
    const minTierRank = requirements.minTier ? (tierRank[requirements.minTier] ?? 0) : 0;

    // Filter candidates
    let candidates = models.filter((m) => {
      const rank = tierRank[m.tier] ?? 0;
      if (rank < minTierRank) return false;
      if (requirements.maxCostPerMillion && m.pricing.outputPerMillion > requirements.maxCostPerMillion) return false;
      if (requirements.requiredCapabilities) {
        for (const cap of requirements.requiredCapabilities) {
          if (cap === 'toolCalling' && !m.capabilities.toolCalling) return false;
          if (cap === 'structuredOutput' && !m.capabilities.structuredOutput) return false;
          if (cap === 'reasoning' && !m.capabilities.reasoning) return false;
        }
      }
      return true;
    });

    if (candidates.length === 0) return null;

    // Sort by suitability for role
    candidates.sort((a, b) => {
      // Prefer higher tier for critical roles
      const criticalRoles = ['reviewer', 'security-reviewer', 'synthesizer'];
      if (criticalRoles.includes(role)) {
        return (tierRank[b.tier] ?? 0) - (tierRank[a.tier] ?? 0);
      }
      // Prefer lower cost for non-critical roles
      return a.pricing.outputPerMillion - b.pricing.outputPerMillion;
    });

    return this.toModelCapability(candidates[0]);
  }

  /**
   * Get all available models.
   */
  getAvailableModels(): ModelCapability[] {
    return this.registry.getAll().map((m) => this.toModelCapability(m));
  }

  /**
   * Get model health (with caching).
   */
  getModelHealth(modelId: string): ModelHealth | null {
    const model = this.registry.get(modelId);
    if (!model) return null;
    const cached = this.healthCache.get(modelId);
    if (cached && Date.now() - cached.lastChecked < 60000) return cached;
    const health: ModelHealth = {
      modelId: model.id,
      provider: model.provider,
      available: true,
      latencyP50Ms: 0,
      latencyP95Ms: 0,
      errorRate: 0,
      lastChecked: Date.now(),
    };
    this.healthCache.set(modelId, health);
    return health;
  }

  /**
   * Get the underlying registry.
   */
  getModelRegistry(): {
    get(modelId: string): ModelCapability | null;
    getAll(): ModelCapability[];
    register(model: ModelCapability): void;
  } {
    return {
      get: (id) => {
        const entry = this.registry.get(id);
        return entry ? this.toModelCapability(entry) : null;
      },
      getAll: () => this.getAvailableModels(),
      register: (model) => {
        this.registry.register({
          id: model.modelId,
          name: model.modelId,
          provider: model.provider,
          contextWindow: model.contextWindow,
          maxOutputTokens: model.contextWindow,
          pricing: {
            inputPerMillion: model.costPerMillionInput,
            outputPerMillion: model.costPerMillionOutput,
          },
          capabilities: {
            toolCalling: model.toolSupport,
            structuredOutput: model.structuredOutput,
            vision: model.modalities.includes('image'),
            reasoning: model.reasoning,
            parallelToolCalls: false,
          },
          degradationThreshold: 0.5,
          tier: model.tier as any,
        });
      },
    };
  }

  private toModelCapability(entry: ModelEntry): ModelCapability {
    return {
      modelId: entry.id,
      provider: entry.provider,
      tier: entry.tier as any,
      contextWindow: entry.contextWindow,
      modalities: entry.capabilities.vision ? ['text', 'image'] : ['text'],
      toolSupport: entry.capabilities.toolCalling,
      structuredOutput: entry.capabilities.structuredOutput,
      streaming: true,
      reasoning: entry.capabilities.reasoning,
      costPerMillionInput: entry.pricing.inputPerMillion,
      costPerMillionOutput: entry.pricing.outputPerMillion,
      specialties: [],
    };
  }
}
