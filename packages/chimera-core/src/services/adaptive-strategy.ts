// =============================================================================
// AdaptiveStrategySelector — auto-selects the best strategy based on task
// complexity, budget, and available models. Supports escalation and repair.
// =============================================================================

import type { ComplexityScore } from '../types/router.js';
import type { AgentRole } from '@chimera/domain';

export interface StrategyRecommendation {
  strategy: string;
  roles: AgentRole[];
  reason: string;
  estimatedCost: number;
  confidence: number;
}

export interface AdaptiveStrategyConfig {
  /** Maximum budget in USD */
  maxBudgetUsd: number;
  /** Whether to allow multi-model strategies */
  allowMultiModel: boolean;
  /** Whether to prefer cheaper strategies */
  preferCheap: boolean;
  /** Minimum confidence threshold for auto-selection */
  minConfidence: number;
}

const DEFAULT_CONFIG: AdaptiveStrategyConfig = {
  maxBudgetUsd: 1.0,
  allowMultiModel: true,
  preferCheap: false,
  minConfidence: 0.5,
};

/**
 * Strategy costs (approximate USD per role).
 */
const STRATEGY_COSTS: Record<string, number> = {
  solo: 0.05,
  duo: 0.10,
  trio: 0.15,
  fusion: 0.25,
  hive: 0.30,
  swarm: 0.50,
};

/**
 * AdaptiveStrategySelector — recommends and adapts strategies.
 */
export class AdaptiveStrategySelector {
  private config: AdaptiveStrategyConfig;

  constructor(config?: Partial<AdaptiveStrategyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Recommend a strategy based on task complexity and constraints.
   */
  recommend(
    complexity: ComplexityScore,
    task: string,
    availableModels: number = 1,
  ): StrategyRecommendation {
    const overall = complexity.overall;

    // Trivial tasks → solo
    if (overall < 0.2) {
      return {
        strategy: 'solo',
        roles: ['implementer'],
        reason: 'Trivial task, single agent sufficient',
        estimatedCost: STRATEGY_COSTS.solo,
        confidence: 0.9,
      };
    }

    // Simple tasks → solo or duo
    if (overall < 0.4) {
      return {
        strategy: 'duo',
        roles: ['implementer', 'reviewer'],
        reason: 'Simple task, writer + reviewer for quality',
        estimatedCost: STRATEGY_COSTS.duo,
        confidence: 0.8,
      };
    }

    // Medium complexity → trio
    if (overall < 0.6) {
      if (availableModels >= 2 && this.config.allowMultiModel) {
        return {
          strategy: 'trio',
          roles: ['implementer', 'reviewer', 'security-reviewer'],
          reason: 'Medium complexity, full verification pipeline',
          estimatedCost: STRATEGY_COSTS.trio,
          confidence: 0.7,
        };
      }
      return {
        strategy: 'duo',
        roles: ['implementer', 'reviewer'],
        reason: 'Medium complexity, limited models available',
        estimatedCost: STRATEGY_COSTS.duo,
        confidence: 0.6,
      };
    }

    // High complexity → fusion or hive
    if (overall < 0.8) {
      if (availableModels >= 3) {
        return {
          strategy: 'hive',
          roles: ['planner', 'implementer', 'synthesizer'],
          reason: 'High complexity, parallel decomposition',
          estimatedCost: STRATEGY_COSTS.hive,
          confidence: 0.6,
        };
      }
      return {
        strategy: 'fusion',
        roles: ['implementer', 'reviewer', 'security-reviewer', 'synthesizer'],
        reason: 'High complexity, panel deliberation',
        estimatedCost: STRATEGY_COSTS.fusion,
        confidence: 0.5,
      };
    }

    // Very complex → swarm
    return {
      strategy: 'swarm',
      roles: ['implementer', 'synthesizer'],
      reason: 'Very complex task, many attempts with voting',
      estimatedCost: STRATEGY_COSTS.swarm,
      confidence: 0.4,
    };
  }

  /**
   * Determine if escalation is needed based on result quality.
   */
  shouldEscalate(
    currentStrategy: string,
    result: {
      confidence: number;
      degraded: boolean;
      cost: number;
    },
  ): boolean {
    // Don't escalate if we've exhausted budget
    if (result.cost >= this.config.maxBudgetUsd) {
      return false;
    }

    // Escalate if result was degraded
    if (result.degraded) {
      return true;
    }

    // Escalate if confidence is below threshold
    if (result.confidence < this.config.minConfidence) {
      return true;
    }

    return false;
  }

  /**
   * Get the next strategy to escalate to.
   */
  escalate(currentStrategy: string): string | null {
    const escalationChain: Record<string, string> = {
      solo: 'duo',
      duo: 'trio',
      trio: 'fusion',
      fusion: 'hive',
      hive: 'swarm',
      swarm: null, // Already at max
    };
    return escalationChain[currentStrategy] ?? null;
  }

  /**
   * Estimate the cost of a strategy.
   */
  estimateCost(strategy: string): number {
    return STRATEGY_COSTS[strategy] ?? 0.10;
  }

  /**
   * Check if a strategy is affordable given remaining budget.
   */
  isAffordable(strategy: string, spentUsd: number): boolean {
    return spentUsd + this.estimateCost(strategy) <= this.config.maxBudgetUsd;
  }
}

// =============================================================================
// RepairLoop — detects failures and attempts repair
// =============================================================================

export interface RepairResult {
  repaired: boolean;
  strategy: string;
  attempts: number;
  cost: number;
  output: string;
}

export interface RepairLoopConfig {
  maxAttempts: number;
  maxBudgetUsd: number;
  escalationEnabled: boolean;
}

const DEFAULT_REPAIR_CONFIG: RepairLoopConfig = {
  maxAttempts: 3,
  maxBudgetUsd: 2.0,
  escalationEnabled: true,
};

/**
 * RepairLoop — manages repair attempts with escalation.
 */
export class RepairLoop {
  private config: RepairLoopConfig;
  private strategySelector: AdaptiveStrategySelector;

  constructor(config?: Partial<RepairLoopConfig>) {
    this.config = { ...DEFAULT_REPAIR_CONFIG, ...config };
    this.strategySelector = new AdaptiveStrategySelector({
      maxBudgetUsd: this.config.maxBudgetUsd,
    });
  }

  /**
   * Determine if a result needs repair.
   */
  needsRepair(result: {
    status: 'done' | 'needs_user' | 'error' | 'blocked';
    confidence?: number;
    degraded?: boolean;
  }): boolean {
    if (result.status === 'error' || result.status === 'blocked') {
      return true;
    }
    if (result.status === 'needs_user') {
      return true;
    }
    if (result.degraded) {
      return true;
    }
    if (result.confidence !== undefined && result.confidence < 0.5) {
      return true;
    }
    return false;
  }

  /**
   * Get the repair strategy for a failed result.
   */
  getRepairStrategy(
    originalStrategy: string,
    failureType: 'degraded' | 'low_confidence' | 'error' | 'needs_user',
  ): string {
    // For errors, try the same strategy again (might be transient)
    if (failureType === 'error') {
      return originalStrategy;
    }

    // For degraded or low confidence, escalate
    if (this.config.escalationEnabled) {
      const next = this.strategySelector.escalate(originalStrategy);
      if (next) return next;
    }

    // Default: try fusion (good balance of quality/cost)
    return 'fusion';
  }

  /**
   * Check if we should continue repairing.
   */
  shouldContinue(attempt: number, spentUsd: number): boolean {
    if (attempt >= this.config.maxAttempts) {
      return false;
    }
    if (spentUsd >= this.config.maxBudgetUsd) {
      return false;
    }
    return true;
  }
}
