// chimera-providers/src/retry.ts
//
// Retry-with-backoff wrapper for transient provider errors.
// Free-tier rate limits (tencent/hy3, Mistral) throw RateLimitError with
// a retryAfter hint — honor it. ProviderUnavailableError (503) gets
// exponential backoff with jitter. Everything else fails fast.

import { RateLimitError, ProviderUnavailableError } from './errors.js';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetriable(err: unknown): boolean {
  return err instanceof RateLimitError || err instanceof ProviderUnavailableError || isEmptyContentError(err);
}

// Check if the provider returned empty content (blank completion). These are
// transient blips that resolve on retry — not a content filter rejection.
function isEmptyContentError(err: unknown): boolean {
  if (!err || typeof err !== 'object' || !('message' in err)) return false;
  const msg = (err as { message: string }).message;
  return /returned empty content/i.test(msg);
}

function delayFor(err: unknown, attempt: number, opts: Required<RetryOptions>): number {
  if (err instanceof RateLimitError && err.retryAfter && err.retryAfter > 0) {
    // Honor provider's retry-after hint (seconds), capped to maxDelay
    return Math.min(err.retryAfter * 1000, opts.maxDelayMs);
  }
  // Exponential backoff with jitter: baseDelay * 2^attempt + random jitter
  const exp = opts.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * opts.baseDelayMs;
  return Math.min(exp + jitter, opts.maxDelayMs);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const fullOpts: Required<RetryOptions> = {
    maxRetries: opts.maxRetries ?? 3,
    baseDelayMs: opts.baseDelayMs ?? 2000,
    maxDelayMs: opts.maxDelayMs ?? 30_000,
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= fullOpts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetriable(err)) throw err;
      if (attempt < fullOpts.maxRetries) {
        await sleep(delayFor(err, attempt, fullOpts));
      }
    }
  }
  throw lastErr;
}
