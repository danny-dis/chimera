export type AgentStatus = 'pending' | 'running' | 'completed' | 'error';
export declare const statusSymbols: Record<AgentStatus, {
    symbol: string;
    color: string;
}>;
export declare const formatCost: (cost: number) => string;
export declare const formatBudget: (budget: number) => string;
export declare const budgetColor: (ratio: number) => string;
export declare const formatTime: (timestamp: number) => string;
export declare const formatDateTime: (date: Date) => string;
//# sourceMappingURL=tui-utils.d.ts.map