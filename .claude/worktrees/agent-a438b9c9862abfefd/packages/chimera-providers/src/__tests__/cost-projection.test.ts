import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRegistry } from '../model-registry.js';
import { ProviderCostTracker } from '../cost-tracker-provider.js';
import { CostProjectionEngine } from '../cost-projection.js';

describe('CostProjectionEngine', () => {
  let tracker: ProviderCostTracker;
  let engine: CostProjectionEngine;

  beforeEach(() => {
    const registry = new ModelRegistry();
    tracker = new ProviderCostTracker(registry);
    engine = new CostProjectionEngine(tracker);
  });

  it('returns low confidence with no calls', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    const projection = engine.project(sessionId, 10);

    expect(projection.confidence).toBe('low');
    expect(projection.basedOnCalls).toBe(0);
    expect(projection.averageCostPerCall).toBe(0);
  });

  it('projects based on average cost per call', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    tracker.recordCall(sessionId, { input: 1000, output: 500 });
    tracker.recordCall(sessionId, { input: 2000, output: 1000 });
    tracker.recordCall(sessionId, { input: 1500, output: 750 });

    engine.recordCall(sessionId, 0.001);
    engine.recordCall(sessionId, 0.002);
    engine.recordCall(sessionId, 0.0015);

    const projection = engine.project(sessionId, 10);

    expect(projection.basedOnCalls).toBe(3);
    expect(projection.confidence).toBe('medium');
    expect(projection.projectedRemaining).toBeGreaterThan(0);
    expect(projection.projectedTotal).toBeGreaterThan(projection.projectedRemaining);
  });

  it('returns high confidence with 10+ calls', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    for (let i = 0; i < 12; i++) {
      tracker.recordCall(sessionId, { input: 1000, output: 500 });
      engine.recordCall(sessionId, 0.001);
    }

    const projection = engine.project(sessionId, 5);
    expect(projection.confidence).toBe('high');
  });

  it('detects increasing trend', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    for (let i = 0; i < 5; i++) {
      tracker.recordCall(sessionId, { input: 1000, output: 500 });
      engine.recordCall(sessionId, 0.001);
    }
    for (let i = 0; i < 3; i++) {
      tracker.recordCall(sessionId, { input: 5000, output: 2500 });
      engine.recordCall(sessionId, 0.005);
    }

    const projection = engine.project(sessionId, 5);
    expect(projection.trend).toBe('increasing');
  });

  it('detects decreasing trend', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    for (let i = 0; i < 5; i++) {
      tracker.recordCall(sessionId, { input: 5000, output: 2500 });
      engine.recordCall(sessionId, 0.005);
    }
    for (let i = 0; i < 3; i++) {
      tracker.recordCall(sessionId, { input: 1000, output: 500 });
      engine.recordCall(sessionId, 0.001);
    }

    const projection = engine.project(sessionId, 5);
    expect(projection.trend).toBe('decreasing');
  });

  it('projects to budget correctly', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    tracker.recordCall(sessionId, { input: 1000, output: 500 });
    engine.recordCall(sessionId, 0.001);

    const result = engine.projectToBudget(sessionId, 0.01);
    expect(result.willExceed).toBe(true);
    expect(result.atCall).toBeGreaterThan(1);
    expect(result.projectedCost).toBeGreaterThan(0.01);
  });

  it('returns willExceed false when under budget', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    tracker.recordCall(sessionId, { input: 1000, output: 500 });
    engine.recordCall(sessionId, 0.001);

    const result = engine.projectToBudget(sessionId, 100);
    expect(result.atCall).toBeGreaterThan(1);
    expect(result.projectedCost).toBeGreaterThan(0);
  });

  it('throws for unknown session', () => {
    expect(() => engine.project('nonexistent', 5)).toThrow('Session not found: nonexistent');
  });

  it('stable trend with few calls', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    tracker.recordCall(sessionId, { input: 1000, output: 500 });
    engine.recordCall(sessionId, 0.001);

    const projection = engine.project(sessionId, 5);
    expect(projection.trend).toBe('stable');
  });
});
