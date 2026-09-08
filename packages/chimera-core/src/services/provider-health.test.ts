import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderHealthMonitor, MultiProviderHealthMonitor } from './provider-health-monitor.js';
import { ModelSelector } from './model-selector.js';
import { SimpleModelRegistry } from '@chimera/providers';

describe('ProviderHealthMonitor', () => {
  let monitor: ProviderHealthMonitor;

  beforeEach(() => {
    monitor = new ProviderHealthMonitor();
  });

  it('starts with no data', () => {
    const metrics = monitor.getMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.available).toBe(true);
  });

  it('records successful requests', () => {
    monitor.recordSuccess(100);
    monitor.recordSuccess(200);
    const metrics = monitor.getMetrics();
    expect(metrics.totalRequests).toBe(2);
    expect(metrics.successfulRequests).toBe(2);
    expect(metrics.failedRequests).toBe(0);
    expect(metrics.errorRate).toBe(0);
    expect(metrics.latencyP50Ms).toBe(100);
    expect(metrics.latencyP95Ms).toBe(200);
  });

  it('records failed requests', () => {
    monitor.recordFailure(500, 'timeout');
    monitor.recordFailure(1000, 'rate_limit');
    const metrics = monitor.getMetrics();
    expect(metrics.totalRequests).toBe(2);
    expect(metrics.failedRequests).toBe(2);
    expect(metrics.errorRate).toBe(1);
  });

  it('calculates percentiles correctly', () => {
    for (let i = 1; i <= 100; i++) {
      monitor.recordSuccess(i);
    }
    const metrics = monitor.getMetrics();
    expect(metrics.latencyP50Ms).toBe(50);
    expect(metrics.latencyP95Ms).toBe(95);
  });

  it('marks provider unavailable after consecutive failures', () => {
    const m = new ProviderHealthMonitor({ failureThreshold: 3, healthyThreshold: 1.1 });
    m.recordFailure(100);
    m.recordFailure(100);
    expect(m.isAvailable()).toBe(true);
    m.recordFailure(100);
    expect(m.isAvailable()).toBe(false);
  });

  it('marks provider unavailable after high error rate', () => {
    const m = new ProviderHealthMonitor({ healthyThreshold: 0.3 });
    // 4 failures out of 10 = 0.4 error rate
    for (let i = 0; i < 6; i++) m.recordSuccess(100);
    for (let i = 0; i < 4; i++) m.recordFailure(100);
    expect(m.isAvailable()).toBe(false);
  });

  it('recovers after success', () => {
    const m = new ProviderHealthMonitor({ failureThreshold: 5, healthyThreshold: 0.5 });
    m.recordFailure(100);
    m.recordFailure(100);
    // 2 failures, 0 successes = 100% error rate, but consecutiveFailures < 5
    expect(m.isAvailable()).toBe(false);
    // Add enough successes to bring error rate below 50% threshold
    for (let i = 0; i < 10; i++) m.recordSuccess(100);
    // Now 2 failures out of 12 = 0.167 error rate, should be available
    expect(m.isAvailable()).toBe(true);
  });

  it('tracks error breakdown', () => {
    monitor.recordFailure(100, 'timeout');
    monitor.recordFailure(100, 'timeout');
    monitor.recordFailure(100, 'rate_limit');
    const breakdown = monitor.getErrorBreakdown();
    expect(breakdown.timeout).toBe(2);
    expect(breakdown.rate_limit).toBe(1);
  });

  it('respects window size', () => {
    const m = new ProviderHealthMonitor({ windowSize: 5 });
    for (let i = 0; i < 10; i++) {
      m.recordSuccess(i + 1);
    }
    // Only last 5 samples kept: 6, 7, 8, 9, 10
    const metrics = m.getMetrics();
    expect(metrics.latencyP50Ms).toBe(8);
  });

  it('resets all data', () => {
    monitor.recordSuccess(100);
    monitor.recordFailure(200);
    monitor.reset();
    const metrics = monitor.getMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.available).toBe(true);
  });
});

describe('MultiProviderHealthMonitor', () => {
  let multi: MultiProviderHealthMonitor;

  beforeEach(() => {
    multi = new MultiProviderHealthMonitor();
  });

  it('tracks multiple providers', () => {
    multi.recordSuccess('anthropic', 100);
    multi.recordSuccess('openai', 200);
    multi.recordFailure('google', 500, 'timeout');

    const metrics = multi.getAllMetrics();
    expect(metrics.get('anthropic')?.totalRequests).toBe(1);
    expect(metrics.get('openai')?.totalRequests).toBe(1);
    expect(metrics.get('google')?.totalRequests).toBe(1);
  });

  it('returns available providers', () => {
    multi.recordSuccess('anthropic', 100);
    multi.recordSuccess('openai', 200);
    // google has failures
    for (let i = 0; i < 5; i++) {
      multi.recordFailure('google', 500);
    }
    const available = multi.getAvailableProviders();
    expect(available).toContain('anthropic');
    expect(available).toContain('openai');
    expect(available).not.toContain('google');
  });

  it('returns healthiest provider', () => {
    // anthropic: 100% success, low latency
    for (let i = 0; i < 10; i++) multi.recordSuccess('anthropic', 50);
    // openai: 100% success, higher latency
    for (let i = 0; i < 10; i++) multi.recordSuccess('openai', 200);
    // google: 50% success
    for (let i = 0; i < 5; i++) multi.recordSuccess('google', 100);
    for (let i = 0; i < 5; i++) multi.recordFailure('google', 500);

    expect(multi.getHealthiestProvider()).toBe('anthropic');
  });
});

describe('ModelSelector with health', () => {
  it('filters out unhealthy providers when preferHealthy is set', () => {
    const registry = new SimpleModelRegistry();
    registry.register({
      id: 'claude-sonnet',
      name: 'Claude Sonnet',
      provider: 'anthropic',
      contextWindow: 200000,
      maxOutputTokens: 4096,
      pricing: { inputPerMillion: 3, outputPerMillion: 15 },
      capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
      degradationThreshold: 0.5,
      tier: 'frontier',
    });
    registry.register({
      id: 'gpt-4',
      name: 'GPT-4',
      provider: 'openai',
      contextWindow: 128000,
      maxOutputTokens: 4096,
      pricing: { inputPerMillion: 10, outputPerMillion: 30 },
      capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
      degradationThreshold: 0.5,
      tier: 'mid',
    });

    const healthMonitor = new MultiProviderHealthMonitor();
    // Mark openai as unhealthy
    for (let i = 0; i < 10; i++) {
      healthMonitor.recordFailure('openai', 500);
    }

    const selector = new ModelSelector(registry, healthMonitor);
    const result = selector.selectForRole('writer', { preferHealthy: true });
    expect(result).not.toBeNull();
    expect(result?.provider).toBe('anthropic');
  });
});
