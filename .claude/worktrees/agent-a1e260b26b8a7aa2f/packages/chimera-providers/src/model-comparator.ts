import { ModelRegistry, ModelEntry } from './model-registry.js';
import { CostCalculator } from './cost-calculator.js';

export interface ModelComparison {
  models: ModelEntry[];
  costPerTask: Map<string, number>;
  qualityScore: Map<string, number>;
  costEfficiency: Map<string, number>;
  recommendation: string;
}

const TIER_QUALITY: Record<string, number> = {
  cheap: 3,
  mid: 6,
  frontier: 8,
  reasoning: 9,
};

export class ModelComparator {
  private calculator: CostCalculator;

  constructor(private registry: ModelRegistry) {
    this.calculator = new CostCalculator(registry);
  }

  compare(
    modelIds: string[],
    estimatedInputTokens: number,
    estimatedOutputTokens: number,
  ): ModelComparison {
    const models: ModelEntry[] = [];
    const costPerTask = new Map<string, number>();
    const qualityScore = new Map<string, number>();
    const costEfficiency = new Map<string, number>();

    for (const id of modelIds) {
      const model = this.registry.get(id);
      if (!model) continue;

      models.push(model);

      const breakdown = this.calculator.calculate(id, {
        input: estimatedInputTokens,
        output: estimatedOutputTokens,
      });
      costPerTask.set(id, breakdown.totalCost);

      const quality = TIER_QUALITY[model.tier] ?? 5;
      qualityScore.set(id, quality);

      const efficiency = breakdown.totalCost > 0 ? quality / breakdown.totalCost : Infinity;
      costEfficiency.set(id, efficiency);
    }

    let recommendation = models[0]?.id ?? '';
    let bestEfficiency = -1;
    for (const [id, efficiency] of costEfficiency) {
      if (efficiency > bestEfficiency) {
        bestEfficiency = efficiency;
        recommendation = id;
      }
    }

    return {
      models,
      costPerTask,
      qualityScore,
      costEfficiency,
      recommendation,
    };
  }

  recommendForTask(taskComplexity: number, budget: number): string {
    const allModels = this.registry.getAll().filter((m) => !m.deprecated);

    let bestId = '';
    let bestScore = -1;

    for (const model of allModels) {
      const quality = TIER_QUALITY[model.tier] ?? 5;
      if (quality < taskComplexity) continue;

      const breakdown = this.calculator.calculate(model.id, {
        input: 1000,
        output: 500,
      });

      if (breakdown.totalCost > budget) continue;

      const efficiency = breakdown.totalCost > 0 ? quality / breakdown.totalCost : Infinity;
      if (efficiency > bestScore) {
        bestScore = efficiency;
        bestId = model.id;
      }
    }

    return bestId;
  }
}
