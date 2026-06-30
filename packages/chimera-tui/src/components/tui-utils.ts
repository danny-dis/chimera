import { zen } from '../theme.js';

export type AgentStatus = 'pending' | 'running' | 'completed' | 'error';

export const statusSymbols: Record<AgentStatus, { symbol: string; color: string }> = {
  pending: { symbol: 'o', color: zen.muted },
  running: { symbol: '*', color: zen.warning },
  completed: { symbol: '+', color: zen.success },
  error: { symbol: 'x', color: zen.error },
};

export const formatCost = (cost: number): string => `$${cost.toFixed(4)}`;

export const formatBudget = (budget: number): string => `$${budget.toFixed(2)}`;

export const budgetColor = (ratio: number): string =>
  ratio > 0.9 ? zen.error : ratio > 0.7 ? zen.warning : zen.success;

export const formatTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

export const formatDateTime = (date: Date): string =>
  date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
