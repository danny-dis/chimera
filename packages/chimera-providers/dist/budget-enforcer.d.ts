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
export declare class BudgetEnforcer {
    private costTracker;
    private config;
    private spentBySession;
    constructor(config: BudgetConfig, costTracker: ProviderCostTracker);
    private safeSessionCost;
    check(taskEstimate: number, sessionId: string): BudgetCheckResult;
    recordSpend(sessionId: string, cost: number): void;
    updateConfig(config: Partial<BudgetConfig>): void;
    getBudgetStatus(sessionId: string): {
        task: BudgetCheckResult;
        session: BudgetCheckResult;
        day: BudgetCheckResult;
    };
    private evaluate;
    private worstAction;
}
//# sourceMappingURL=budget-enforcer.d.ts.map