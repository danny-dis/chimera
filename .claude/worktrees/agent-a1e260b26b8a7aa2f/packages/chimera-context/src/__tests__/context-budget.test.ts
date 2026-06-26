import { describe, it, expect, beforeEach } from 'vitest';
import { ContextBudget } from '../context-budget.js';
import type { ContextLayer } from '../context-budget.js';

describe('ContextBudget', () => {
  let budget: ContextBudget;

  beforeEach(() => {
    budget = new ContextBudget({ totalBudget: 200_000 });
  });

  describe('constructor', () => {
    it('creates with default layers', () => {
      const alloc = budget.getAllocation();
      expect(alloc.length).toBeGreaterThan(0);
      const names = alloc.map(a => a.layer);
      expect(names).toContain('system');
      expect(names).toContain('history');
    });

    it('creates with custom layers', () => {
      const custom = new ContextBudget({
        totalBudget: 50_000,
        layers: [
          { name: 'custom', priority: 1, maxTokens: 10_000, minTokens: 1_000 },
        ],
      });
      const alloc = custom.getAllocation();
      expect(alloc).toHaveLength(1);
      expect(alloc[0].layer).toBe('custom');
    });
  });

  describe('registerLayer', () => {
    it('adds a new layer', () => {
      const layer: ContextLayer = {
        name: 'custom',
        priority: 10,
        tokenCount: 0,
        maxTokens: 5000,
        minTokens: 500,
      };
      budget.registerLayer(layer);

      const alloc = budget.getAllocation();
      const custom = alloc.find(a => a.layer === 'custom');
      expect(custom).toBeDefined();
      expect(custom!.allocated).toBe(5000);
    });
  });

  describe('updateLayer', () => {
    it('updates token count', () => {
      budget.updateLayer('system', 1500);
      const alloc = budget.getAllocation();
      const system = alloc.find(a => a.layer === 'system');
      expect(system!.used).toBe(1500);
    });

    it('throws for unknown layer', () => {
      expect(() => budget.updateLayer('nonexistent', 100)).toThrow('not registered');
    });
  });

  describe('getAllocation', () => {
    it('returns all allocations', () => {
      budget.updateLayer('system', 1000);
      budget.updateLayer('history', 40_000);

      const alloc = budget.getAllocation();
      expect(alloc.length).toBeGreaterThan(0);

      const system = alloc.find(a => a.layer === 'system');
      expect(system!.allocated).toBe(2000);
      expect(system!.used).toBe(1000);
      expect(system!.utilization).toBeCloseTo(0.5);
    });
  });

  describe('getReport', () => {
    it('returns budget report with recommendations', () => {
      budget.updateLayer('system', 1900);
      budget.updateLayer('history', 75_000);

      const report = budget.getReport();
      expect(report.totalBudget).toBe(200_000);
      expect(report.totalUsed).toBeGreaterThan(0);
      expect(report.utilization).toBeGreaterThan(0);
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('recommends compression for over-limit layers', () => {
      budget.updateLayer('system', 3000);
      const report = budget.getReport();
      expect(report.recommendations.some(r => r.includes('system'))).toBe(true);
    });
  });

  describe('availableTokens', () => {
    it('calculates remaining tokens', () => {
      budget.updateLayer('system', 1000);
      budget.updateLayer('history', 10_000);
      const available = budget.availableTokens();
      expect(available).toBe(200_000 - 11_000);
    });

    it('returns 0 when over budget', () => {
      budget.updateLayer('history', 200_000);
      const available = budget.availableTokens();
      expect(available).toBe(0);
    });
  });

  describe('suggestCompression', () => {
    it('suggests which layers to compress', () => {
      budget.updateLayer('system', 1900);
      budget.updateLayer('history', 78_000);

      const suggestions = budget.suggestCompression();
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].targetTokens).toBeGreaterThan(0);
      expect(suggestions[0].reason).toBeDefined();
    });

    it('returns empty when no layers need compression', () => {
      budget.updateLayer('system', 100);
      const suggestions = budget.suggestCompression();
      expect(suggestions).toHaveLength(0);
    });
  });

  describe('autoBalance', () => {
    it('redistributes tokens by priority', () => {
      const allocs = budget.autoBalance();
      expect(allocs.length).toBeGreaterThan(0);
      const totalAlloc = allocs.reduce((s, a) => s + a.allocated, 0);
      expect(totalAlloc).toBeLessThanOrEqual(200_000);
    });

    it('adjusts maxTokens based on remaining budget', () => {
      const smallBudget = new ContextBudget({
        totalBudget: 10_000,
        layers: [
          { name: 'a', priority: 1, maxTokens: 5000, minTokens: 500 },
          { name: 'b', priority: 2, maxTokens: 8000, minTokens: 500 },
        ],
      });
      const allocs = smallBudget.autoBalance();
      const total = allocs.reduce((s, a) => s + a.allocated, 0);
      expect(total).toBeLessThanOrEqual(10_000);
    });
  });

  describe('compressLayer', () => {
    it('compresses a layer and reports freed tokens', () => {
      budget.updateLayer('system', 2000);
      const result = budget.compressLayer('system', 1000);
      expect(result).not.toBeNull();
      expect(result!.freed).toBe(1000);
    });

    it('returns 0 freed when already under target', () => {
      budget.updateLayer('system', 500);
      const result = budget.compressLayer('system', 1000);
      expect(result!.freed).toBe(0);
    });

    it('returns null for unknown layer', () => {
      expect(budget.compressLayer('nonexistent', 100)).toBeNull();
    });
  });

  describe('setTotalBudget', () => {
    it('updates the total budget', () => {
      budget.setTotalBudget(500_000);
      const report = budget.getReport();
      expect(report.totalBudget).toBe(500_000);
    });
  });
});
