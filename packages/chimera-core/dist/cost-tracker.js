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
    getRemaining(provider, scope) {
        const budget = this.budgets.get(provider)?.[scope] ?? Infinity;
        return Math.max(0, budget - (this.spend.get(provider) ?? 0));
    }
    checkAlerts(provider, currentSpend) {
        const budget = this.budgets.get(provider)?.perSession ?? Infinity;
        if (budget === Infinity)
            return;
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
exports.CostTracker = CostTracker;
//# sourceMappingURL=cost-tracker.js.map