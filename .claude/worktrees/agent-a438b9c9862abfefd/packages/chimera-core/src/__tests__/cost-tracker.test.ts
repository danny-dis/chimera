import { describe, it, expect, vi } from 'vitest';
import { CostTracker } from '../cost-tracker.js';
import { EventStream } from '../event-stream.js';

describe('CostTracker', () => {
  it('records spend and returns correct total', () => {
    const tracker = new CostTracker(new EventStream());
    tracker.recordSpend('openai', 1.5);
    tracker.recordSpend('openai', 2.5);

    expect(tracker.getSpend('openai')).toBe(4.0);
  });

  it('getSpend returns 0 for unknown provider', () => {
    const tracker = new CostTracker(new EventStream());
    expect(tracker.getSpend('unknown')).toBe(0);
  });

  it('getRemaining returns budget minus spend', () => {
    const tracker = new CostTracker(new EventStream());
    tracker.setBudget('openai', { perTask: 10, perSession: 50, perDay: 100 });
    tracker.recordSpend('openai', 5);

    expect(tracker.getRemaining('openai', 'perTask')).toBe(5);
    expect(tracker.getRemaining('openai', 'perSession')).toBe(45);
    expect(tracker.getRemaining('openai', 'perDay')).toBe(95);
  });

  it('getRemaining returns Infinity for provider with no budget', () => {
    const tracker = new CostTracker(new EventStream());
    expect(tracker.getRemaining('unknown', 'perTask')).toBe(Infinity);
  });

  it('getRemaining clamps to 0 when spend exceeds budget', () => {
    const tracker = new CostTracker(new EventStream());
    tracker.setBudget('openai', { perTask: 10, perSession: 50, perDay: 100 });
    tracker.recordSpend('openai', 15);

    expect(tracker.getRemaining('openai', 'perTask')).toBe(0);
  });

  it('emits cost_alert at 50% threshold', () => {
    const eventStream = new EventStream();
    const tracker = new CostTracker(eventStream);
    tracker.setBudget('openai', { perTask: 10, perSession: 100, perDay: 200 });

    tracker.recordSpend('openai', 50);

    const alerts = eventStream.getByType('cost_alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: 'cost_alert',
      currentCost: 50,
      budget: 100,
      percentage: 50,
      action: 'warn',
    });
  });

  it('emits cost_alert at 80% threshold', () => {
    const eventStream = new EventStream();
    const tracker = new CostTracker(eventStream);
    tracker.setBudget('openai', { perTask: 10, perSession: 100, perDay: 200 });

    tracker.recordSpend('openai', 80);

    const alerts = eventStream.getByType('cost_alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      action: 'warn',
      percentage: 80,
    });
  });

  it('emits cost_alert at 95% with throttle action', () => {
    const eventStream = new EventStream();
    const tracker = new CostTracker(eventStream);
    tracker.setBudget('openai', { perTask: 10, perSession: 100, perDay: 200 });

    tracker.recordSpend('openai', 95);

    const alerts = eventStream.getByType('cost_alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      action: 'throttle',
      percentage: 95,
    });
  });

  it('emits cost_alert at 100% with stop action', () => {
    const eventStream = new EventStream();
    const tracker = new CostTracker(eventStream);
    tracker.setBudget('openai', { perTask: 10, perSession: 100, perDay: 200 });

    tracker.recordSpend('openai', 100);

    const alerts = eventStream.getByType('cost_alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      action: 'stop',
      percentage: 100,
    });
  });

  it('does not emit alert when spend is below 50%', () => {
    const eventStream = new EventStream();
    const tracker = new CostTracker(eventStream);
    tracker.setBudget('openai', { perTask: 10, perSession: 100, perDay: 200 });

    tracker.recordSpend('openai', 40);

    const alerts = eventStream.getByType('cost_alert');
    expect(alerts).toHaveLength(0);
  });

  it('emits only one alert (highest matched threshold)', () => {
    const eventStream = new EventStream();
    const tracker = new CostTracker(eventStream);
    tracker.setBudget('openai', { perTask: 10, perSession: 100, perDay: 200 });

    tracker.recordSpend('openai', 96);

    const alerts = eventStream.getByType('cost_alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ action: 'throttle' });
  });

  it('no alert when no budget is set', () => {
    const eventStream = new EventStream();
    const tracker = new CostTracker(eventStream);

    tracker.recordSpend('openai', 1000);

    const alerts = eventStream.getByType('cost_alert');
    expect(alerts).toHaveLength(0);
  });

  it('tracks spend for multiple providers independently', () => {
    const tracker = new CostTracker(new EventStream());
    tracker.recordSpend('openai', 5);
    tracker.recordSpend('anthropic', 10);

    expect(tracker.getSpend('openai')).toBe(5);
    expect(tracker.getSpend('anthropic')).toBe(10);
  });
});
