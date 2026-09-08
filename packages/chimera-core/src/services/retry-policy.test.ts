import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetryPolicy, RetryableErrors } from './retry-policy.js';

describe('RetryPolicy', () => {
  it('returns result on first success', async () => {
    const policy = new RetryPolicy({ maxRetries: 3, initialDelayMs: 10 });
    const fn = vi.fn().mockResolvedValue('success');
    const result = await policy.execute(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const policy = new RetryPolicy({ maxRetries: 3, initialDelayMs: 10 });
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');
    const result = await policy.execute(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after max retries exhausted', async () => {
    const policy = new RetryPolicy({ maxRetries: 2, initialDelayMs: 10 });
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    await expect(policy.execute(fn)).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry non-retryable errors', async () => {
    const policy = new RetryPolicy({
      maxRetries: 3,
      initialDelayMs: 10,
      isRetryable: () => false,
    });
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));
    await expect(policy.execute(fn)).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls onAttempt callback for each failed attempt', async () => {
    const policy = new RetryPolicy({ maxRetries: 2, initialDelayMs: 10 });
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');
    const attempts: any[] = [];
    await policy.execute(fn, (attempt) => attempts.push(attempt));
    expect(attempts).toHaveLength(2);
    expect(attempts[0].willRetry).toBe(true);
    expect(attempts[1].willRetry).toBe(true);
  });

  it('calculates exponential backoff delays', () => {
    const policy = new RetryPolicy({
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });
    expect(policy.getDelayForAttempt(0)).toBe(100);
    expect(policy.getDelayForAttempt(1)).toBe(200);
    expect(policy.getDelayForAttempt(2)).toBe(400);
    expect(policy.getDelayForAttempt(3)).toBe(800);
  });

  it('caps delay at maxDelayMs', () => {
    const policy = new RetryPolicy({
      maxRetries: 10,
      initialDelayMs: 100,
      maxDelayMs: 500,
      backoffMultiplier: 2,
    });
    expect(policy.getDelayForAttempt(10)).toBe(500);
  });

  describe('RetryableErrors', () => {
    it('always returns true', () => {
      expect(RetryableErrors.always()).toBe(true);
    });

    it('never returns false', () => {
      expect(RetryableErrors.never()).toBe(false);
    });

    it('detects network errors', () => {
      expect(RetryableErrors.networkOnly(new Error('ECONNRESET'))).toBe(true);
      expect(RetryableErrors.networkOnly(new Error('ETIMEDOUT'))).toBe(true);
      expect(RetryableErrors.networkOnly(new Error('ENOTFOUND'))).toBe(true);
      expect(RetryableErrors.networkOnly(new Error('fatal'))).toBe(false);
    });

    it('detects rate limit errors', () => {
      expect(RetryableErrors.rateLimitAndServer(new Error('HTTP 429'))).toBe(true);
      expect(RetryableErrors.rateLimitAndServer(new Error('HTTP 503'))).toBe(true);
      expect(RetryableErrors.rateLimitAndServer(new Error('HTTP 400'))).toBe(false);
    });
  });
});
