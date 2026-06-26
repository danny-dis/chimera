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

  /** Get total spend across all providers. */
  getTotalCost(): number {
    let total = 0;
    for (const amount of this.spend.values()) {
      total += amount;
    }
    return total;
  }

  getRemaining(provider: string, scope: 'perTask' | 'perSession' | 'perDay'): number {
    const budget = this.budgets.get(provider)?.[scope] ?? Infinity;
    return Math.max(0, budget - (this.spend.get(provider) ?? 0));
  }

  private checkAlerts(provider: string, currentSpend: number): void {
    const budget = this.budgets.get(provider)?.perSession ?? Infinity;
    if (budget === Infinity) return;

    const percentage = (currentSpend / budget) * 100;
    const thresholds: Array<{ pct: number; action: 'warn' | 'warn' | 'throttle' | 'stop' }> = [
      { pct: 50, action: 'warn' },
      { pct: 80, action: 'warn' },
      { pct: 95, action: 'throttle' },
      { pct: 100, action: 'stop' },
    ];

    // Find the highest threshold the spend has crossed and emit a single
    // alert for it. Thresholds are pre-sorted ascending.
    let matched: typeof thresholds[number] | null = null;
    for (const t of thresholds) {
      if (percentage >= t.pct) {
        matched = t;
      } else {
        break;
      }
    }

    if (matched) {
      this.eventStream.append({
        type: 'cost_alert',
        currentCost: currentSpend,
        budget,
        percentage,
        action: matched.action,
      });
    }
  }
}
