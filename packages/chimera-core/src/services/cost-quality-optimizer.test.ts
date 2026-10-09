import { describe, it, expect, beforeEach } from 'vitest';
import { CostQualityOptimizer } from './cost-quality-optimizer.js';

describe('CostQualityOptimizer', () => {
  let optimizer: CostQualityOptimizer;

  beforeEach(() => {
    optimizer = new CostQualityOptimizer();
  });

  describe('recordStrategyRun', () => {
    it('records strategy runs', () => {
      optimizer.recordStrategyRun('solo', true, 0.05, 0.9);
      optimizer.recordStrategyRun('solo', false, 0.03, 0.4);
      const stats = optimizer.getStrategyPerformance('solo');
      expect(stats?.totalRuns).toBe(2);
      expect(stats?.successfulRuns).toBe(1);
      expect(stats?.successRate).toBe(0.5);
    });

    it('calculates average cost', () => {
      optimizer.recordStrategyRun('duo', true, 0.10, 0.8);
      optimizer.recordStrategyRun('duo', true, 0.20, 0.9);
      const stats = optimizer.getStrategyPerformance('duo');
      expect(stats?.avgCost).toBeCloseTo(0.15, 5);
    });
  });

  describe('recordModelRun', () => {
    it('records model runs', () => {
      optimizer.recordModelRun('claude', true, 0.05, 100);
      optimizer.recordModelRun('claude', false, 0.03, 200);
      const stats = optimizer.getModelPerformance('claude');
      expect(stats?.totalRuns).toBe(2);
      expect(stats?.successfulRuns).toBe(1);
    });
  });

  describe('getMostCostEffectiveStrategy', () => {
    it('returns solo when no data', () => {
      expect(optimizer.getMostCostEffectiveStrategy()).toBe('solo');
    });

    it('returns the most cost-effective strategy', () => {
      // solo: 100% success, $0.05 avg = score ~20
      for (let i = 0; i < 10; i++) {
        optimizer.recordStrategyRun('solo', true, 0.05, 0.9);
      }
      // trio: 80% success, $0.15 avg = score ~5.3
      for (let i = 0; i < 8; i++) {
        optimizer.recordStrategyRun('trio', true, 0.15, 0.8);
      }
      for (let i = 0; i < 2; i++) {
        optimizer.recordStrategyRun('trio', false, 0.15, 0.3);
      }
      expect(optimizer.getMostCostEffectiveStrategy()).toBe('solo');
    });
  });

  describe('getSummary', () => {
    it('returns summary statistics', () => {
      optimizer.recordStrategyRun('solo', true, 0.05, 0.9);
      optimizer.recordModelRun('claude', true, 0.05, 100);
      const summary = optimizer.getSummary();
      expect(summary.totalStrategyRuns).toBe(1);
      expect(summary.totalModelRuns).toBe(1);
      expect(summary.overallSuccessRate).toBe(1);
    });
  });
});
