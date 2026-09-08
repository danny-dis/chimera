import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveStrategySelector, RepairLoop } from './adaptive-strategy.js';

describe('AdaptiveStrategySelector', () => {
  let selector: AdaptiveStrategySelector;

  beforeEach(() => {
    selector = new AdaptiveStrategySelector();
  });

  describe('recommend', () => {
    it('recommends solo for trivial tasks', () => {
      const rec = selector.recommend({ overall: 0.1, dimensions: {} as any }, 'Fix typo');
      expect(rec.strategy).toBe('solo');
      expect(rec.roles).toEqual(['implementer']);
    });

    it('recommends duo for simple tasks', () => {
      const rec = selector.recommend({ overall: 0.3, dimensions: {} as any }, 'Add logging');
      expect(rec.strategy).toBe('duo');
      expect(rec.roles).toContain('reviewer');
    });

    it('recommends trio for medium tasks', () => {
      const rec = selector.recommend({ overall: 0.5, dimensions: {} as any }, 'Add auth', 2);
      expect(rec.strategy).toBe('trio');
    });

    it('recommends fusion or hive for high complexity', () => {
      const rec = selector.recommend({ overall: 0.7, dimensions: {} as any }, 'Refactor core');
      expect(['fusion', 'hive']).toContain(rec.strategy);
    });

    it('recommends swarm for very complex tasks', () => {
      const rec = selector.recommend({ overall: 0.9, dimensions: {} as any }, 'Build entire system');
      expect(rec.strategy).toBe('swarm');
    });

    it('falls back to duo when models are limited', () => {
      const rec = selector.recommend({ overall: 0.5, dimensions: {} as any }, 'Add auth', 1);
      expect(rec.strategy).toBe('duo');
    });
  });

  describe('shouldEscalate', () => {
    it('escalates on degraded result', () => {
      expect(selector.shouldEscalate('solo', {
        confidence: 0.8,
        degraded: true,
        cost: 0.05,
      })).toBe(true);
    });

    it('escalates on low confidence', () => {
      expect(selector.shouldEscalate('solo', {
        confidence: 0.3,
        degraded: false,
        cost: 0.05,
      })).toBe(true);
    });

    it('does not escalate when budget exhausted', () => {
      expect(selector.shouldEscalate('solo', {
        confidence: 0.3,
        degraded: false,
        cost: 2.0,
      })).toBe(false);
    });

    it('does not escalate when result is good', () => {
      expect(selector.shouldEscalate('solo', {
        confidence: 0.9,
        degraded: false,
        cost: 0.05,
      })).toBe(false);
    });
  });

  describe('escalate', () => {
    it('escalates solo → duo', () => {
      expect(selector.escalate('solo')).toBe('duo');
    });

    it('escalates duo → trio', () => {
      expect(selector.escalate('duo')).toBe('trio');
    });

    it('escalates swarm → null', () => {
      expect(selector.escalate('swarm')).toBeNull();
    });
  });

  describe('isAffordable', () => {
    it('solo is affordable with default budget', () => {
      expect(selector.isAffordable('solo', 0)).toBe(true);
    });

    it('swarm is not affordable when budget is low', () => {
      const s = new AdaptiveStrategySelector({ maxBudgetUsd: 0.1 });
      expect(s.isAffordable('swarm', 0)).toBe(false);
    });
  });
});

describe('RepairLoop', () => {
  let loop: RepairLoop;

  beforeEach(() => {
    loop = new RepairLoop();
  });

  describe('needsRepair', () => {
    it('needs repair on error', () => {
      expect(loop.needsRepair({ status: 'error' })).toBe(true);
    });

    it('needs repair on blocked', () => {
      expect(loop.needsRepair({ status: 'blocked' })).toBe(true);
    });

    it('needs repair on degraded', () => {
      expect(loop.needsRepair({ status: 'done', degraded: true })).toBe(true);
    });

    it('needs repair on low confidence', () => {
      expect(loop.needsRepair({ status: 'done', confidence: 0.3 })).toBe(true);
    });

    it('does not need repair on good result', () => {
      expect(loop.needsRepair({ status: 'done', confidence: 0.9 })).toBe(false);
    });
  });

  describe('getRepairStrategy', () => {
    it('retries same strategy for errors', () => {
      expect(loop.getRepairStrategy('solo', 'error')).toBe('solo');
    });

    it('escalates for degraded results', () => {
      expect(loop.getRepairStrategy('solo', 'degraded')).toBe('duo');
    });

    it('escalates for low confidence', () => {
      expect(loop.getRepairStrategy('duo', 'low_confidence')).toBe('trio');
    });
  });

  describe('shouldContinue', () => {
    it('continues within budget and attempts', () => {
      expect(loop.shouldContinue(1, 0.1)).toBe(true);
    });

    it('stops after max attempts', () => {
      expect(loop.shouldContinue(3, 0.1)).toBe(false);
    });

    it('stops after budget exhausted', () => {
      expect(loop.shouldContinue(1, 2.0)).toBe(false);
    });
  });
});
