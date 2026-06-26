import { z } from 'zod';
import { ProviderCostTracker } from './cost-tracker-provider.js';

export type BudgetAction = 'allow' | 'warn' | 'throttle' | 'stop';

export interface BudgetConfig {
  perTask: number;
  perSession: number;
  perDay: number;
  alertThresholds: number[];
}

export interface BudgetCheckResult {
  action: BudgetAction;
  reason: string;
  currentCost: number;
  budget: number;
  percentage: number;
}

const BudgetConfigSchema = z.object({
  perTask: z.number().positive(),
  perSession: z.number().positive(),
  perDay: z.number().positive(),
  alertThresholds: z.array(z.number().min(0).max(1)),
});

export class BudgetEnforcer {
  private config: BudgetConfig;
  private spentBySession: Map<string, number> = new Map();

  constructor(
    config: BudgetConfig,
    private costTracker: ProviderCostTracker,
  ) {
    this.config = BudgetConfigSchema.parse(config);
  }

  check(taskEstimate: number, sessionId: string): BudgetCheckResult {
    const sessionCost = this.costTracker.getSessionCost(sessionId);
    const dayTotal = this.costTracker.getDayTotalAll();

    const taskResult = this.evaluate(taskEstimate, taskEstimate, this.config.perTask, 'task');
    const sessionResult = this.evaluate(
      sessionCost + taskEstimate,
      sessionCost + taskEstimate,
      this.config.perSession,
      'session',
    );
    const dayResult = this.evaluate(
      dayTotal + taskEstimate,
      dayTotal + taskEstimate,
      this.config.perDay,
      'day',
    );

    const worst = this.worstAction([taskResult, sessionResult, dayResult]);
    return worst;
  }

  recordSpend(sessionId: string, cost: number): void {
    const current = this.spentBySession.get(sessionId) ?? 0;
    this.spentBySession.set(sessionId, current + cost);
  }

  updateConfig(config: Partial<BudgetConfig>): void {
    const merged = { ...this.config, ...config };
    this.config = BudgetConfigSchema.parse(merged);
  }

  getBudgetStatus(sessionId: string): {
    task: BudgetCheckResult;
    session: BudgetCheckResult;
    day: BudgetCheckResult;
  } {
    const sessionCost = this.costTracker.getSessionCost(sessionId);
    const dayTotal = this.costTracker.getDayTotalAll();
    const sessionSpent = this.spentBySession.get(sessionId) ?? 0;

    return {
      task: this.evaluate(0, 0, this.config.perTask, 'task'),
      session: this.evaluate(sessionCost + sessionSpent, sessionCost + sessionSpent, this.config.perSession, 'session'),
      day: this.evaluate(dayTotal, dayTotal, this.config.perDay, 'day'),
    };
  }

  private evaluate(
    projectedCost: number,
    currentCost: number,
    budget: number,
    scope: string,
  ): BudgetCheckResult {
    const percentage = budget > 0 ? projectedCost / budget : 0;

    if (percentage >= 1.0) {
      return {
        action: 'stop',
        reason: `${scope} budget exceeded: $${projectedCost.toFixed(4)} / $${budget.toFixed(2)} (${(percentage * 100).toFixed(1)}%)`,
        currentCost,
        budget,
        percentage,
      };
    }

    if (percentage >= 0.95) {
      return {
        action: 'throttle',
        reason: `${scope} budget at critical level: ${(percentage * 100).toFixed(1)}% used`,
        currentCost,
        budget,
        percentage,
      };
    }

    const triggeredThreshold = [...this.config.alertThresholds]
      .sort((a, b) => b - a)
      .find((t) => percentage >= t);

    if (triggeredThreshold !== undefined) {
      return {
        action: 'warn',
        reason: `${scope} budget at ${(percentage * 100).toFixed(1)}% (threshold: ${(triggeredThreshold * 100).toFixed(0)}%)`,
        currentCost,
        budget,
        percentage,
      };
    }

    return {
      action: 'allow',
      reason: `${scope} budget within limits: ${(percentage * 100).toFixed(1)}% used`,
      currentCost,
      budget,
      percentage,
    };
  }

  private worstAction(results: BudgetCheckResult[]): BudgetCheckResult {
    const priority: BudgetAction[] = ['stop', 'throttle', 'warn', 'allow'];
    let worst = results[0];
    for (const result of results) {
      if (priority.indexOf(result.action) < priority.indexOf(worst.action)) {
        worst = result;
      }
    }
    return worst;
  }
}
