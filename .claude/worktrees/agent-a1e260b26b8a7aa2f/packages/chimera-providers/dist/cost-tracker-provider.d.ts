import { ModelRegistry } from './model-registry.js';
import { CostBreakdown } from './cost-calculator.js';
export interface CostSession {
    id: string;
    startTime: Date;
    modelId: string;
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    callCount: number;
}
export declare class ProviderCostTracker {
    private registry;
    private sessions;
    private dailyTotals;
    constructor(registry: ModelRegistry);
    startSession(modelId: string): string;
    recordCall(sessionId: string, tokens: {
        input: number;
        output: number;
    }): CostBreakdown;
    getSessionCost(sessionId: string): number;
    getDayTotal(modelId: string): number;
    getDayTotalAll(): number;
    resetDay(): void;
    getSession(sessionId: string): CostSession | undefined;
    getAllSessions(): CostSession[];
}
//# sourceMappingURL=cost-tracker-provider.d.ts.map