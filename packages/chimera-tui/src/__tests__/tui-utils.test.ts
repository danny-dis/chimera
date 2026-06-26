import { describe, it, expect } from 'vitest';
import {
  statusSymbols,
  formatCost,
  formatBudget,
  budgetColor,
  formatTime,
  formatDateTime,
} from '../components/tui-utils.js';

describe('statusSymbols', () => {
  it('has all four statuses', () => {
    expect(statusSymbols.pending).toBeDefined();
    expect(statusSymbols.running).toBeDefined();
    expect(statusSymbols.completed).toBeDefined();
    expect(statusSymbols.error).toBeDefined();
  });

  it('each status has symbol and color', () => {
    for (const status of ['pending', 'running', 'completed', 'error'] as const) {
      expect(typeof statusSymbols[status].symbol).toBe('string');
      expect(typeof statusSymbols[status].color).toBe('string');
    }
  });
});

describe('formatCost', () => {
  it('formats with 4 decimal places', () => {
    expect(formatCost(1.5)).toBe('$1.5000');
  });

  it('formats zero', () => {
    expect(formatCost(0)).toBe('$0.0000');
  });

  it('rounds to 4 decimals', () => {
    expect(formatCost(1.23456)).toBe('$1.2346');
  });
});

describe('formatBudget', () => {
  it('formats with 2 decimal places', () => {
    expect(formatBudget(10)).toBe('$10.00');
  });

  it('formats fractional', () => {
    expect(formatBudget(9.99)).toBe('$9.99');
  });
});

describe('budgetColor', () => {
  it('returns green at or below 0.7', () => {
    expect(budgetColor(0)).toBe('green');
    expect(budgetColor(0.5)).toBe('green');
    expect(budgetColor(0.7)).toBe('green');
  });

  it('returns yellow above 0.7 up to 0.9', () => {
    expect(budgetColor(0.71)).toBe('yellow');
    expect(budgetColor(0.8)).toBe('yellow');
    expect(budgetColor(0.89)).toBe('yellow');
  });

  it('returns red above 0.9', () => {
    expect(budgetColor(0.91)).toBe('red');
    expect(budgetColor(1.0)).toBe('red');
    expect(budgetColor(1.5)).toBe('red');
  });
});

describe('formatTime', () => {
  it('formats a timestamp as HH:MM:SS', () => {
    // 2024-01-15T14:30:45Z
    const ts = new Date('2024-01-15T14:30:45Z').getTime();
    const result = formatTime(ts);
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

describe('formatDateTime', () => {
  it('formats a Date as compact date+time', () => {
    const date = new Date('2024-06-15T14:30:00');
    const result = formatDateTime(date);
    expect(result).toContain('Jun');
    expect(result).toContain('15');
  });
});
