import { ProviderCostTracker } from './cost-tracker-provider.js';
export interface CostProjection {
    projectedTotal: number;
    projectedRemaining: number;
    confidence: 'low' | 'medium' | 'high';
    basedOnCalls: number;
    averageCostPerCall: number;
    trend: 'increasing' | 'stable' | 'decreasing';
}
export declare class CostProjectionEngine {
    private costTracker;
    private callHistory;
    constructor(costTracker: ProviderCostTracker);
    project(sessionId: string, estimatedRemainingCalls: number): CostProjection;
    projectToBudget(sessionId: string, budget: number): {
        willExceed: boolean;
        atCall: number;
        projectedCost: number;
    };
    recordCall(sessionId: string, cost: number): void;
    private computeConfidence;
    private computeTrend;
}
//# sourceMappingURL=cost-projection.d.ts.map