import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRegistry } from '../model-registry.js';
import { ProviderCostTracker } from '../cost-tracker-provider.js';
import { BudgetEnforcer } from '../budget-enforcer.js';

describe('BudgetEnforcer', () => {
  let tracker: ProviderCostTracker;
  let enforcer: BudgetEnforcer;

  beforeEach(() => {
    const registry = new ModelRegistry();
    tracker = new ProviderCostTracker(registry);
    enforcer = new BudgetEnforcer(
      {
        perTask: 1.0,
        perSession: 5.0,
        perDay: 20.0,
        alertThresholds: [0.5, 0.8, 0.95, 1.0],
      },
      tracker,
    );
  });

  it('allows under-budget requests', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    const result = enforcer.check(0.1, sessionId);
    expect(result.action).toBe('allow');
  });

  it('warns at threshold', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    const result = enforcer.check(0.5, sessionId);
    expect(result.action).toBe('warn');
  });

  it('throttles near budget limit', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    const result = enforcer.check(0.96, sessionId);
    expect(result.action).toBe('throttle');
  });

  it('stops when budget exceeded', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    const result = enforcer.check(1.5, sessionId);
    expect(result.action).toBe('stop');
  });

  it('records spend and tracks it', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    enforcer.recordSpend(sessionId, 2.0);
    enforcer.recordSpend(sessionId, 1.0);

    const status = enforcer.getBudgetStatus(sessionId);
    expect(status.session.percentage).toBeCloseTo(0.6, 1);
  });

  it('returns full budget status', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    const status = enforcer.getBudgetStatus(sessionId);

    expect(status.task).toBeDefined();
    expect(status.session).toBeDefined();
    expect(status.day).toBeDefined();
    expect(status.task.budget).toBe(1.0);
    expect(status.session.budget).toBe(5.0);
    expect(status.day.budget).toBe(20.0);
  });

  it('updates config', () => {
    enforcer.updateConfig({ perTask: 2.0 });
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    const status = enforcer.getBudgetStatus(sessionId);
    expect(status.task.budget).toBe(2.0);
  });

  it('picks worst action across scopes', () => {
    const sessionId = tracker.startSession('anthropic/claude-sonnet-4-20250514');
    for (let i = 0; i < 5; i++) {
      tracker.recordCall(sessionId, { input: 300_000, output: 100_000 });
    }

    const result = enforcer.check(0.2, sessionId);
    expect(result.action).toBe('stop');
  });

  it('warns at 80% threshold', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    const result = enforcer.check(0.8, sessionId);
    expect(result.action).toBe('warn');
  });

  it('reports percentage correctly', () => {
    const sessionId = tracker.startSession('openai/gpt-4o-mini');
    const result = enforcer.check(0.5, sessionId);
    expect(result.percentage).toBeCloseTo(0.5, 2);
  });
});
