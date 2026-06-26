import { describe, it, expect, vi } from 'vitest';
import { ConcurrencyGovernor } from '../concurrency-governor.js';
import os from 'os';

describe('ConcurrencyGovernor', () => {
  it('should suggest base concurrency when health is good', () => {
    const governor = new ConcurrencyGovernor({ baseConcurrency: 4 });
    const suggestion = governor.suggestConcurrency({
      cpuLoad: 1,
      freeMem: 2048 * 1024 * 1024,
      queueSize: 5
    });
    expect(suggestion).toBe(4);
  });

  it('should scale up when queue is large and health is good', () => {
    const governor = new ConcurrencyGovernor({ baseConcurrency: 4, maxConcurrency: 10 });
    const suggestion = governor.suggestConcurrency({
      cpuLoad: 1,
      freeMem: 2048 * 1024 * 1024,
      queueSize: 20
    });
    expect(suggestion).toBe(10);
  });

  it('should cap concurrency when CPU load is high', () => {
    const governor = new ConcurrencyGovernor({ maxCpuLoad: 2, baseConcurrency: 4, maxConcurrency: 10 });
    const suggestion = governor.suggestConcurrency({
      cpuLoad: 4, // 2x the limit
      queueSize: 100 // wants to scale to 10
    });
    expect(suggestion).toBe(5); // maxConcurrency 10 * (2/4)
  });

  it('should scale to 1 on backpressure', () => {
    const governor = new ConcurrencyGovernor();
    const suggestion = governor.suggestConcurrency({
      backpressure: true
    });
    expect(suggestion).toBe(1);
  });
});
