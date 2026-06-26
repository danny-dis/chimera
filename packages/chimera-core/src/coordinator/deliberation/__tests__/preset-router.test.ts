import { describe, it, expect } from 'vitest';
import { PresetRouter, getAutoSelectionReason } from '../preset-router.js';
import type { ComplexityScore } from '../../../types/router.js';

describe('PresetRouter', () => {
  describe('selectPreset', () => {
    it('selects solo for low-complexity tasks', () => {
      const router = new PresetRouter();
      const preset = router.selectPreset(
        'fix typo in comments',
        { overall: 0.2, dimensions: {} },
        ['provider-a'],
      );
      expect(preset).toBe('solo');
    });

    it('selects duo for medium-complexity tasks with 2+ providers', () => {
      const router = new PresetRouter();
      const preset = router.selectPreset(
        'refactor authentication module',
        { overall: 0.5, dimensions: {} },
        ['provider-a', 'provider-b'],
      );
      expect(preset).toBe('duo');
    });

    it('selects trio for high-complexity tasks with 2+ providers', () => {
      const router = new PresetRouter();
      const preset = router.selectPreset(
        'redesign system architecture',
        { overall: 0.8, dimensions: {} },
        ['provider-a', 'provider-b'],
      );
      expect(preset).toBe('trio');
    });

    it('falls back to solo when not enough providers for duo', () => {
      const router = new PresetRouter();
      const preset = router.selectPreset(
        'refactor authentication module',
        { overall: 0.5, dimensions: {} },
        ['provider-a'],
      );
      expect(preset).toBe('solo');
    });

    it('falls back to solo when not enough providers for trio', () => {
      const router = new PresetRouter();
      const preset = router.selectPreset(
        'redesign system architecture',
        { overall: 0.8, dimensions: {} },
        ['provider-a'],
      );
      expect(preset).toBe('solo');
    });

    it('respects custom complexity thresholds', () => {
      const router = new PresetRouter({
        complexityThresholds: { solo: 0.1, duo: 0.3 },
      });
      
      // Below solo threshold
      expect(router.selectPreset('fix typo', { overall: 0.05, dimensions: {} }, ['a'])).toBe('solo');
      
      // Between solo and duo thresholds
      expect(router.selectPreset('refactor', { overall: 0.2, dimensions: {} }, ['a', 'b'])).toBe('duo');
      
      // Above duo threshold
      expect(router.selectPreset('architecture', { overall: 0.5, dimensions: {} }, ['a', 'b'])).toBe('trio');
    });
  });

  describe('classifyTaskType', () => {
    it('detects debug tasks', () => {
      const router = new PresetRouter();
      expect(router.classifyTaskType('fix the bug')).toBe('debug');
      expect(router.classifyTaskType('error in production')).toBe('debug');
      expect(router.classifyTaskType('failing test')).toBe('debug');
    });

    it('detects review tasks', () => {
      const router = new PresetRouter();
      expect(router.classifyTaskType('review this code')).toBe('review');
      expect(router.classifyTaskType('audit security')).toBe('review');
      expect(router.classifyTaskType('check for issues')).toBe('review');
    });

    it('detects hive tasks', () => {
      const router = new PresetRouter();
      expect(router.classifyTaskType('handle multiple components')).toBe('hive');
      expect(router.classifyTaskType('several things to do')).toBe('hive');
      expect(router.classifyTaskType('comprehensive analysis')).toBe('hive');
    });

    it('detects fusion tasks', () => {
      const router = new PresetRouter();
      expect(router.classifyTaskType('compare different approaches')).toBe('fusion');
      expect(router.classifyTaskType('what are the perspectives')).toBe('fusion');
      expect(router.classifyTaskType('debate the options')).toBe('fusion');
    });

    it('returns code for generic tasks', () => {
      const router = new PresetRouter();
      expect(router.classifyTaskType('implement new feature')).toBe('code');
      expect(router.classifyTaskType('write a function')).toBe('code');
    });
  });

  describe('task type overrides', () => {
    it('applies task type overrides', () => {
      const router = new PresetRouter({
        taskTypeOverrides: { debug: 'solo', review: 'trio' },
      });
      
      // Debug task should use solo override regardless of complexity
      const debugPreset = router.selectPreset(
        'fix critical production error',
        { overall: 0.9, dimensions: {} },
        ['provider-a', 'provider-b'],
      );
      expect(debugPreset).toBe('solo');
      
      // Review task should use trio override
      const reviewPreset = router.selectPreset(
        'review this code',
        { overall: 0.2, dimensions: {} },
        ['provider-a'],
      );
      expect(reviewPreset).toBe('trio');
    });

    it('auto-selects hive for hive-type tasks via default override', () => {
      const router = new PresetRouter();
      const preset = router.selectPreset(
        'handle multiple components and several modules',
        { overall: 0.5, dimensions: {} },
        ['provider-a', 'provider-b'],
      );
      expect(preset).toBe('hive');
    });

    it('custom overrides can replace the default hive override', () => {
      const router = new PresetRouter({
        taskTypeOverrides: { hive: 'trio' },
      });
      const preset = router.selectPreset(
        'handle multiple components',
        { overall: 0.5, dimensions: {} },
        ['provider-a', 'provider-b'],
      );
      expect(preset).toBe('trio');
    });
  });
});

describe('getAutoSelectionReason', () => {
  it('returns task type reason when task type is not code', () => {
    const reason = getAutoSelectionReason(
      'solo',
      { overall: 0.5, dimensions: {} },
      'debug',
    );
    expect(reason).toBe('Task type "debug" detected');
  });

  it('returns low complexity reason', () => {
    const reason = getAutoSelectionReason(
      'solo',
      { overall: 0.2, dimensions: {} },
      'code',
    );
    expect(reason).toBe('Low complexity (0.20)');
  });

  it('returns medium complexity reason', () => {
    const reason = getAutoSelectionReason(
      'duo',
      { overall: 0.5, dimensions: {} },
      'code',
    );
    expect(reason).toBe('Medium complexity (0.50)');
  });

  it('returns high complexity reason', () => {
    const reason = getAutoSelectionReason(
      'trio',
      { overall: 0.8, dimensions: {} },
      'code',
    );
    expect(reason).toBe('High complexity (0.80)');
  });
});
