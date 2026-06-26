"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CostTracker = void 0;
/**
 * Real-time per-provider spend tracking, budget enforcement, and cost projection.
 * Alerts at configurable thresholds (50%, 80%, 95%, 100%).
 */
class CostTracker {
    eventStream;
    budgets = new Map();
    spend = new Map();
    constructor(eventStream) {
        this.eventStream = eventStream;
    }
    setBudget(provider, limits) {
        this.budgets.set(provider, limits);
    }
    recordSpend(provider, amount) {
        const current = this.spend.get(provider) ?? 0;
        this.spend.set(provider, current + amount);
        this.checkAlerts(provider, current + amount);
    }
    getSpend(provider) {
        return this.spend.get(provider) ?? 0;
    }
    /** Get total spend across all providers. */
    getTotalCost() {
        let total = 0;
        for (const amount of this.spend.values()) {
            total += amount;
        }
        return total;
    }
    getRemaining(provider, scope) {
        const budget = this.budgets.get(provider)?.[scope] ?? Infinity;
        return Math.max(0, budget - (this.spend.get(provider) ?? 0));
    }
    checkAlerts(provider, currentSpend) {
        const budget = this.budgets.get(provider)?.perSession ?? Infinity;
        if (budget === Infinity)
            return;
        const percentage = (currentSpend / budget) * 100;
        const thresholds = [
            { pct: 50, action: 'warn' },
            { pct: 80, action: 'warn' },
            { pct: 95, action: 'throttle' },
            { pct: 100, action: 'stop' },
        ];
        // Find the highest threshold the spend has crossed and emit a single
        // alert for it. Thresholds are pre-sorted ascending.
        let matched = null;
        for (const t of thresholds) {
            if (percentage >= t.pct) {
                matched = t;
            }
            else {
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
exports.CostTracker = CostTracker;
//# sourceMappingURL=cost-tracker.js.map