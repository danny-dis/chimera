export interface ContextLayer {
    name: string;
    priority: number;
    tokenCount: number;
    maxTokens: number;
    minTokens: number;
    compressed?: boolean;
}
export interface BudgetAllocation {
    layer: string;
    allocated: number;
    used: number;
    utilization: number;
    status: 'ok' | 'near_limit' | 'over_limit' | 'compressed';
}
export interface BudgetReport {
    totalAllocated: number;
    totalUsed: number;
    totalBudget: number;
    utilization: number;
    layers: BudgetAllocation[];
    recommendations: string[];
}
export declare class ContextBudget {
    private layers;
    private totalBudget;
    constructor(params: {
        totalBudget: number;
        layers?: Array<{
            name: string;
            priority: number;
            maxTokens: number;
            minTokens?: number;
        }>;
    });
    registerLayer(layer: ContextLayer): void;
    updateLayer(name: string, tokenCount: number): void;
    getAllocation(): BudgetAllocation[];
    getReport(): BudgetReport;
    availableTokens(): number;
    compressLayer(name: string, targetTokens: number): {
        freed: number;
        compressed: string;
    } | null;
    suggestCompression(): Array<{
        layer: string;
        targetTokens: number;
        reason: string;
    }>;
    autoBalance(): BudgetAllocation[];
    setTotalBudget(budget: number): void;
    private buildRecommendations;
}
//# sourceMappingURL=context-budget.d.ts.map