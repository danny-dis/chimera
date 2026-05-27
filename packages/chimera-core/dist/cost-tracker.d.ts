import { EventStream } from './event-stream.js';
/**
 * Real-time per-provider spend tracking, budget enforcement, and cost projection.
 * Alerts at configurable thresholds (50%, 80%, 95%, 100%).
 */
export declare class CostTracker {
    private eventStream;
    private budgets;
    private spend;
    constructor(eventStream: EventStream);
    setBudget(provider: string, limits: {
        perTask: number;
        perSession: number;
        perDay: number;
    }): void;
    recordSpend(provider: string, amount: number): void;
    getSpend(provider: string): number;
    getRemaining(provider: string, scope: 'perTask' | 'perSession' | 'perDay'): number;
    private checkAlerts;
}
//# sourceMappingURL=cost-tracker.d.ts.map