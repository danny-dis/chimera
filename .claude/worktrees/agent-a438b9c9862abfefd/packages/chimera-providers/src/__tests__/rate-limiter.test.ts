import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter } from '../rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('acquires immediately when under limits', async () => {
    const limiter = new RateLimiter({ rpm: 10, tpm: 1000 });
    const start = Date.now();

    const promise = limiter.acquire(10);
    vi.advanceTimersByTime(0);
    await promise;

    const elapsed = Date.now() - start;
    expect(elapsed).toBe(0);
  });

  it('tracks remaining capacity', () => {
    const limiter = new RateLimiter({ rpm: 10, tpm: 1000 });

    const remaining = limiter.getRemaining();
    expect(remaining.rpm).toBe(10);
    expect(remaining.tpm).toBe(1000);
  });

  it('is not throttled when under limits', () => {
    const limiter = new RateLimiter({ rpm: 10, tpm: 1000 });
    expect(limiter.isThrottled()).toBe(false);
  });

  it('decrements remaining after acquire', async () => {
    const limiter = new RateLimiter({ rpm: 10, tpm: 1000 });

    await limiter.acquire(100);
    const remaining = limiter.getRemaining();

    expect(remaining.rpm).toBe(9);
    expect(remaining.tpm).toBe(900);
  });

  it('becomes throttled when RPM exhausted', async () => {
    const limiter = new RateLimiter({ rpm: 2, tpm: 10_000 });

    await limiter.acquire(1);
    await limiter.acquire(1);

    expect(limiter.isThrottled()).toBe(true);
  });

  it('becomes throttled when TPM exhausted', async () => {
    const limiter = new RateLimiter({ rpm: 100, tpm: 10 });

    await limiter.acquire(5);
    await limiter.acquire(5);

    expect(limiter.isThrottled()).toBe(true);
  });

  it('respects RPD limit', async () => {
    const limiter = new RateLimiter({ rpm: 100, tpm: 100_000, rpd: 2 });

    await limiter.acquire(1);
    await limiter.acquire(1);

    expect(limiter.isThrottled()).toBe(true);
  });

  it('cleans up old entries after window expires', async () => {
    const limiter = new RateLimiter({ rpm: 2, tpm: 1000 });

    await limiter.acquire(1);
    await limiter.acquire(1);

    expect(limiter.getRemaining().rpm).toBe(0);

    vi.advanceTimersByTime(61_000);

    const remaining = limiter.getRemaining();
    expect(remaining.rpm).toBe(2);
    expect(remaining.tpm).toBe(1000);
  });
});
