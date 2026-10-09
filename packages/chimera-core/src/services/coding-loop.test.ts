import { describe, it, expect, beforeEach } from 'vitest';
import { CodingLoop } from './coding-loop.js';

describe('CodingLoop', () => {
  let loop: CodingLoop;

  beforeEach(() => {
    loop = new CodingLoop();
  });

  describe('initial state', () => {
    it('starts in understand phase', () => {
      expect(loop.getState().phase).toBe('understand');
    });

    it('starts with zero iterations', () => {
      expect(loop.getState().iterations).toBe(0);
    });
  });

  describe('transition', () => {
    it('transitions to a new phase', () => {
      loop.transition('plan');
      expect(loop.getState().phase).toBe('plan');
    });
  });

  describe('recordFileChange', () => {
    it('records file changes', () => {
      loop.recordFileChange('src/app.ts');
      loop.recordFileChange('src/utils.ts');
      expect(loop.getState().filesChanged).toHaveLength(2);
    });

    it('deduplicates file changes', () => {
      loop.recordFileChange('src/app.ts');
      loop.recordFileChange('src/app.ts');
      expect(loop.getState().filesChanged).toHaveLength(1);
    });
  });

  describe('recordTestResults', () => {
    it('records test results', () => {
      loop.recordTestResults(5, 2);
      expect(loop.getState().testsPassed).toBe(5);
      expect(loop.getState().testsFailed).toBe(2);
    });

    it('accumulates test results', () => {
      loop.recordTestResults(3, 1);
      loop.recordTestResults(2, 0);
      expect(loop.getState().testsPassed).toBe(5);
      expect(loop.getState().testsFailed).toBe(1);
    });
  });

  describe('recordError', () => {
    it('records errors', () => {
      loop.recordError('Syntax error');
      expect(loop.getState().errors).toContain('Syntax error');
    });
  });

  describe('recordWarning', () => {
    it('records warnings', () => {
      loop.recordWarning('Unused variable');
      expect(loop.getState().warnings).toContain('Unused variable');
    });
  });

  describe('shouldContinue', () => {
    it('continues within max iterations', () => {
      expect(loop.shouldContinue()).toBe(true);
    });

    it('stops after max iterations', () => {
      const l = new CodingLoop({ maxIterations: 1 });
      l.incrementIteration();
      expect(l.shouldContinue()).toBe(false);
    });

    it('stops when delivered', () => {
      loop.transition('deliver');
      expect(loop.shouldContinue()).toBe(false);
    });
  });

  describe('incrementIteration', () => {
    it('increments iteration counter', () => {
      loop.incrementIteration();
      expect(loop.getState().iterations).toBe(1);
    });
  });

  describe('getNextPhase', () => {
    it('understand → plan', () => {
      expect(loop.getNextPhase()).toBe('plan');
    });

    it('plan → explore', () => {
      loop.transition('plan');
      expect(loop.getNextPhase()).toBe('explore');
    });

    it('explore → implement', () => {
      loop.transition('explore');
      expect(loop.getNextPhase()).toBe('implement');
    });

    it('implement → test when testing enabled', () => {
      loop.transition('implement');
      expect(loop.getNextPhase()).toBe('test');
    });

    it('implement → review when testing disabled', () => {
      const l = new CodingLoop({ enableTesting: false });
      l.transition('implement');
      expect(l.getNextPhase()).toBe('review');
    });

    it('test → repair when tests fail', () => {
      loop.transition('test');
      loop.recordTestResults(0, 1);
      expect(loop.getNextPhase()).toBe('repair');
    });

    it('test → review when tests pass', () => {
      loop.transition('test');
      loop.recordTestResults(5, 0);
      expect(loop.getNextPhase()).toBe('review');
    });

    it('review → repair when errors exist', () => {
      loop.transition('review');
      loop.recordError('Error');
      expect(loop.getNextPhase()).toBe('repair');
    });

    it('review → verify when no errors', () => {
      loop.transition('review');
      expect(loop.getNextPhase()).toBe('verify');
    });

    it('repair → implement', () => {
      loop.transition('repair');
      expect(loop.getNextPhase()).toBe('implement');
    });

    it('verify → deliver', () => {
      loop.transition('verify');
      expect(loop.getNextPhase()).toBe('deliver');
    });
  });

  describe('isSuccessful', () => {
    it('returns true when delivered with no errors', () => {
      loop.transition('deliver');
      expect(loop.isSuccessful()).toBe(true);
    });

    it('returns false when not delivered', () => {
      loop.transition('verify');
      expect(loop.isSuccessful()).toBe(false);
    });

    it('returns false when delivered with errors', () => {
      loop.transition('deliver');
      loop.recordError('Error');
      expect(loop.isSuccessful()).toBe(false);
    });
  });

  describe('getSummary', () => {
    it('returns summary', () => {
      loop.recordFileChange('a.ts');
      loop.recordFileChange('b.ts');
      loop.recordTestResults(5, 2);
      loop.recordError('Error');
      loop.recordWarning('Warning');
      const summary = loop.getSummary();
      expect(summary.filesChanged).toBe(2);
      expect(summary.testsPassed).toBe(5);
      expect(summary.testsFailed).toBe(2);
      expect(summary.errors).toBe(1);
      expect(summary.warnings).toBe(1);
    });
  });
});
