import { EventStream } from './event-stream.js';

/**
 * Real-time per-provider spend tracking, budget enforcement, and cost projection.
 * Alerts at configurable thresholds (50%, 80%, 95%, 100%).
 */
export class CostTracker {
  private eventStream: EventStream;
  private budgets: Map<string, { perTask: number; perSession: number; perDay: number }> = new Map();
  private spend: Map<string, number> = new Map();

  constructor(eventStream: EventStream) {
    this.eventStream = eventStream;
  }

  setBudget(provider: string, limits: { perTask: number; perSession: number; perDay: number }): void {
    this.budgets.set(provider, limits);
  }

  recordSpend(provider: string, amount: number): void {
    const current = this.spend.get(provider) ?? 0;
    this.spend.set(provider, current + amount);
    this.checkAlerts(provider, current + amount);
  }

  getSpend(provider: string): number {
    return this.spend.get(provider) ?? 0;
  }

  getRemaining(provider: string, scope: 'perTask' | 'perSession' | 'perDay'): number {
    const budget = this.budgets.get(provider)?.[scope] ?? Infinity;
    return Math.max(0, budget - (this.spend.get(provider) ?? 0));
  }

  private checkAlerts(provider: string, currentSpend: number): void {
    const budget = this.budgets.get(provider)?.perSession ?? Infinity;
    if (budget === Infinity) return;

    const percentage = (currentSpend / budget) * 100;
    const thresholds = [50, 80, 95, 100];

    for (const threshold of thresholds) {
      if (percentage >= threshold) {
        const action = threshold >= 100 ? 'stop' : threshold >= 95 ? 'throttle' : 'warn';
        this.eventStream.append({
          type: 'cost_alert',
          currentCost: currentSpend,
          budget,
          percentage,
          action,
        });
        break;
      }
    }
  }
}
