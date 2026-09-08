// =============================================================================
// CostQualityOptimizer — optimizes cost per successful verified outcome.
// Tracks strategy/model performance and enables adaptive escalation.
// =============================================================================

export interface StrategyPerformance {
  strategy: string;
  totalRuns: number;
  successfulRuns: number;
  totalCost: number;
  avgCost: number;
  successRate: number;
  avgConfidence: number;
}

export interface ModelPerformance {
  modelId: string;
  totalRuns: number;
  successfulRuns: number;
  totalCost: number;
  avgCost: number;
  successRate: number;
  avgLatencyMs: number;
}

export interface TaskClassProfile {
  taskType: string;
  bestStrategy: string;
  bestModel: string;
  avgCost: number;
  successRate: number;
}

/**
 * CostQualityOptimizer — tracks and optimizes cost vs quality.
 */
export class CostQualityOptimizer {
  private strategyStats = new Map<string, StrategyPerformance>();
  private modelStats = new Map<string, ModelPerformance>();
  private taskProfiles = new Map<string, TaskClassProfile>();

  /**
   * Record a strategy execution result.
   */
  recordStrategyRun(
    strategy: string,
    success: boolean,
    cost: number,
    confidence: number,
  ): void {
    const stats = this.strategyStats.get(strategy) ?? {
      strategy,
      totalRuns: 0,
      successfulRuns: 0,
      totalCost: 0,
      avgCost: 0,
      successRate: 0,
      avgConfidence: 0,
    };
    stats.totalRuns++;
    if (success) stats.successfulRuns++;
    stats.totalCost += cost;
    stats.avgCost = stats.totalCost / stats.totalRuns;
    stats.successRate = stats.successfulRuns / stats.totalRuns;
    stats.avgConfidence = (stats.avgConfidence * (stats.totalRuns - 1) + confidence) / stats.totalRuns;
    this.strategyStats.set(strategy, stats);
  }

  /**
   * Record a model execution result.
   */
  recordModelRun(
    modelId: string,
    success: boolean,
    cost: number,
    latencyMs: number,
  ): void {
    const stats = this.modelStats.get(modelId) ?? {
      modelId,
      totalRuns: 0,
      successfulRuns: 0,
      totalCost: 0,
      avgCost: 0,
      successRate: 0,
      avgLatencyMs: 0,
    };
    stats.totalRuns++;
    if (success) stats.successfulRuns++;
    stats.totalCost += cost;
    stats.avgCost = stats.totalCost / stats.totalRuns;
    stats.successRate = stats.successfulRuns / stats.totalRuns;
    stats.avgLatencyMs = (stats.avgLatencyMs * (stats.totalRuns - 1) + latencyMs) / stats.totalRuns;
    this.modelStats.set(modelId, stats);
  }

  /**
   * Get the best strategy for a task type.
   */
  getBestStrategy(taskType: string): string {
    const profile = this.taskProfiles.get(taskType);
    return profile?.bestStrategy ?? 'solo';
  }

  /**
   * Get the best model for a task type.
   */
  getBestModel(taskType: string): string {
    const profile = this.taskProfiles.get(taskType);
    return profile?.bestModel ?? 'default';
  }

  /**
   * Get strategy performance stats.
   */
  getStrategyPerformance(strategy: string): StrategyPerformance | undefined {
    return this.strategyStats.get(strategy);
  }

  /**
   * Get model performance stats.
   */
  getModelPerformance(modelId: string): ModelPerformance | undefined {
    return this.modelStats.get(modelId);
  }

  /**
   * Get all strategy performances.
   */
  getAllStrategyPerformances(): StrategyPerformance[] {
    return [...this.strategyStats.values()];
  }

  /**
   * Get all model performances.
   */
  getAllModelPerformances(): ModelPerformance[] {
    return [...this.modelStats.values()];
  }

  /**
   * Get the most cost-effective strategy.
   */
  getMostCostEffectiveStrategy(): string {
    let best = 'solo';
    let bestScore = -1;
    for (const [strategy, stats] of this.strategyStats) {
      if (stats.totalRuns < 5) continue; // Need enough data
      const score = stats.successRate / (stats.avgCost + 0.01);
      if (score > bestScore) {
        bestScore = score;
        best = strategy;
      }
    }
    return best;
  }

  /**
   * Get the most cost-effective model.
   */
  getMostCostEffectiveModel(): string {
    let best = 'default';
    let bestScore = -1;
    for (const [modelId, stats] of this.modelStats) {
      if (stats.totalRuns < 5) continue;
      const score = stats.successRate / (stats.avgCost + 0.01);
      if (score > bestScore) {
        bestScore = score;
        best = modelId;
      }
    }
    return best;
  }

  /**
   * Get summary statistics.
   */
  getSummary(): {
    totalStrategyRuns: number;
    totalModelRuns: number;
    bestStrategy: string;
    bestModel: string;
    overallSuccessRate: number;
    totalCost: number;
  } {
    const strategies = [...this.strategyStats.values()];
    const models = [...this.modelStats.values()];
    const totalRuns = strategies.reduce((sum, s) => sum + s.totalRuns, 0);
    const totalSuccess = strategies.reduce((sum, s) => sum + s.successfulRuns, 0);
    const totalCost = strategies.reduce((sum, s) => sum + s.totalCost, 0);
    return {
      totalStrategyRuns: totalRuns,
      totalModelRuns: models.reduce((sum, m) => sum + m.totalRuns, 0),
      bestStrategy: this.getMostCostEffectiveStrategy(),
      bestModel: this.getMostCostEffectiveModel(),
      overallSuccessRate: totalRuns > 0 ? totalSuccess / totalRuns : 0,
      totalCost,
    };
  }
}
