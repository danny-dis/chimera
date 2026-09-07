import { CostTracker } from '../cost-tracker.js';
import { EventStream } from '../event-stream.js';

/**
 * BudgetController — wraps CostTracker to provide the domain interface.
 * Tracks spend, enforces budgets, and emits alerts.
 */
export class BudgetController {
  private costTracker: CostTracker;

  constructor(eventStream?: EventStream) {
    this.costTracker = new CostTracker(eventStream ?? new EventStream());
  }

  recordSpend(provider: string, amount: number): void {
    this.costTracker.recordSpend(provider, amount);
  }

  getSpend(provider: string): number {
    return this.costTracker.getSpend(provider);
  }

  getTotalCost(): number {
    return this.costTracker.getTotalCost();
  }

  getRemaining(provider: string, scope: 'perTask' | 'perSession' | 'perDay'): number {
    return this.costTracker.getRemaining(provider, scope);
  }

  estimateCost(inputTokens: number, outputTokens: number, provider: string): number {
    // Use the same estimateCost logic from session-orchestrator
    // Default pricing if provider not known
    const inputCost = (inputTokens / 1_000_000) * 3;   // $3/M input
    const outputCost = (outputTokens / 1_000_000) * 15; // $15/M output
    return inputCost + outputCost;
  }

  checkAlert(provider: string): 'ok' | 'warn' | 'throttle' | 'stop' {
    const spend = this.costTracker.getSpend(provider);
    // Simple threshold-based alert
    if (spend >= 100) return 'stop';
    if (spend >= 80) return 'throttle';
    if (spend >= 50) return 'warn';
    return 'ok';
  }

  setBudget(provider: string, limits: { perTask: number; perSession: number; perDay: number }): void {
    this.costTracker.setBudget(provider, limits);
  }
}
