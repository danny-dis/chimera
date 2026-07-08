import { zen } from '../theme.js';
export const statusSymbols = {
    pending: { symbol: 'o', color: zen.muted },
    running: { symbol: '*', color: zen.warning },
    completed: { symbol: '+', color: zen.success },
    error: { symbol: 'x', color: zen.error },
};
export const formatCost = (cost) => `$${cost.toFixed(4)}`;
export const formatBudget = (budget) => `$${budget.toFixed(2)}`;
export const budgetColor = (ratio) => ratio > 0.9 ? zen.error : ratio > 0.7 ? zen.warning : zen.success;
export const formatTime = (timestamp) => new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});
export const formatDateTime = (date) => date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});
//# sourceMappingURL=tui-utils.js.map