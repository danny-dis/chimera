export interface ToolResultBudgetResult {
    messages: Array<{
        role: string;
        content: string;
    }>;
    trimmed: number;
}
export declare function applyToolResultBudget(messages: Array<{
    role: string;
    content: string;
}>): ToolResultBudgetResult;
//# sourceMappingURL=tool-result-budget.d.ts.map