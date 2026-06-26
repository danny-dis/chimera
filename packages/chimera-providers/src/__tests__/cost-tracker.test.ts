import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRegistry } from '../model-registry.js';
import { ProviderCostTracker } from '../cost-tracker-provider.js';

describe('ProviderCostTracker', () => {
  let tracker: ProviderCostTracker;

  beforeEach(() => {
    const registry = new ModelRegistry();
    tracker = new ProviderCostTracker(registry);
  });

  it('starts a session', () => {
    const id = tracker.startSession('openai/gpt-4o-mini');
    expect(id).toBeTruthy();
    expect(id.startsWith('session_')).toBe(true);
  });

  it('throws for unknown model', () => {
    expect(() => tracker.startSession('unknown/model')).toThrow(
      'Model not found in registry: unknown/model',
    );
  });

  it('records a call and returns breakdown', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    const breakdown = tracker.recordCall(sessionId, { input: 1000, output: 500 });

    expect(breakdown.totalCost).toBeGreaterThan(0);
    expect(breakdown.tokenCount.input).toBe(1000);
    expect(breakdown.tokenCount.output).toBe(500);
  });

  it('tracks session cost cumulatively', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    tracker.recordCall(sessionId, { input: 1000, output: 500 });
    tracker.recordCall(sessionId, { input: 2000, output: 1000 });

    const cost = tracker.getSessionCost(sessionId);
    expect(cost).toBeGreaterThan(0);
  });

  it('tracks day total per model', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    tracker.recordCall(sessionId, { input: 1_000_000, output: 0 });

    const dayTotal = tracker.getDayTotal('openai/gpt-4o-mini');
    expect(dayTotal).toBeCloseTo(0.15, 2);
  });

  it('tracks day total for all models', () => {
    const s1 = tracker.startSession('openai/gpt-4o-mini');
    const s2 = tracker.startSession('google/gemini-2.0-flash');
    tracker.recordCall(s1, { input: 1_000_000, output: 0 });
    tracker.recordCall(s2, { input: 1_000_000, output: 0 });

    const total = tracker.getDayTotalAll();
    expect(total).toBeCloseTo(0.25, 2);
  });

  it('resets day total', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    tracker.recordCall(sessionId, { input: 1_000_000, output: 0 });
    expect(tracker.getDayTotalAll()).toBeGreaterThan(0);

    tracker.resetDay();
    expect(tracker.getDayTotalAll()).toBe(0);
  });

  it('returns session info', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    tracker.recordCall(sessionId, { input: 1000, output: 500 });

    const session = tracker.getSession(sessionId);
    expect(session).toBeDefined();
    expect(session?.modelId).toBe('openai/gpt-4o-mini');
    expect(session?.callCount).toBe(1);
  });

  it('returns all sessions', () => {
    tracker.startSession('openai/gpt-4o-mini');
    tracker.startSession('google/gemini-2.0-flash');

    const sessions = tracker.getAllSessions();
    expect(sessions.length).toBe(2);
  });

  it('throws for unknown session', () => {
    expect(() => tracker.getSessionCost('nonexistent')).toThrow(
      'Session not found: nonexistent',
    );
  });

  it('accumulates tokens correctly', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    tracker.recordCall(sessionId, { input: 1000, output: 500 });
    tracker.recordCall(sessionId, { input: 2000, output: 1500 });

    const session = tracker.getSession(sessionId);
    expect(session?.totalInputTokens).toBe(3000);
    expect(session?.totalOutputTokens).toBe(2000);
    expect(session?.callCount).toBe(2);
  });
});
