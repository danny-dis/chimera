// =============================================================================
// RetryPolicy — configurable retry with exponential backoff and jitter.
// Prevents thundering-herd scenarios when multiple failed runs retry.
// =============================================================================

export interface RetryPolicyOptions {
  /** Maximum number of retry attempts (not counting the initial attempt) */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay cap in milliseconds */
  maxDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Random jitter factor (0-1). 0 = no jitter, 1 = full random */
  jitterFactor: number;
  /** Predicate to determine if an error is retryable */
  isRetryable?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: RetryPolicyOptions = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
  jitterFactor: 0.3,
  isRetryable: () => true,
};

export interface RetryAttempt {
  attempt: number;
  delayMs: number;
  error: unknown;
  willRetry: boolean;
}

/**
 * RetryPolicy — exponential backoff with jitter for transient failures.
 * 
 * Usage:
 *   const policy = new RetryPolicy({ maxRetries: 3, initialDelayMs: 100 });
 *   const result = await policy.execute(() => flakyNetworkCall());
 */
export class RetryPolicy {
  private options: RetryPolicyOptions;

  constructor(options?: Partial<RetryPolicyOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Execute a function with retry logic.
   * @param fn The function to execute
   * @param onAttempt Optional callback for each attempt (for logging/observability)
   * @returns The result of the function
   * @throws The last error if all retries are exhausted
   */
  async execute<T>(
    fn: () => Promise<T>,
    onAttempt?: (attempt: RetryAttempt) => void,
  ): Promise<T> {
    let lastError: unknown;
    let delay = this.options.initialDelayMs;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt >= this.options.maxRetries;
        const retryable = this.options.isRetryable!(error);

        const attemptInfo: RetryAttempt = {
          attempt: attempt + 1,
          delayMs: delay,
          error,
          willRetry: !isLastAttempt && retryable,
        };

        onAttempt?.(attemptInfo);

        if (isLastAttempt || !retryable) {
          throw error;
        }

        await this.sleep(this.applyJitter(delay));
        delay = Math.min(delay * this.options.backoffMultiplier, this.options.maxDelayMs);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError;
  }

  /**
   * Calculate the delay for a given attempt (0-indexed).
   * Useful for external callers that want to schedule their own retries.
   */
  getDelayForAttempt(attempt: number): number {
    const raw = this.options.initialDelayMs * Math.pow(this.options.backoffMultiplier, attempt);
    return Math.min(raw, this.options.maxDelayMs);
  }

  /**
   * Check if an error is retryable according to the policy.
   */
  isRetryable(error: unknown): boolean {
    return this.options.isRetryable!(error);
  }

  /**
   * Apply jitter to a delay value.
   * Returns a random value in [delay * (1 - jitter), delay].
   */
  private applyJitter(delay: number): number {
    if (this.options.jitterFactor <= 0) return delay;
    const jitterRange = delay * this.options.jitterFactor;
    const jitter = Math.random() * jitterRange;
    return delay - jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Common retryable error predicates.
 */
export const RetryableErrors = {
  /** Always retry (default) */
  always: () => true,
  /** Never retry */
  never: () => false,
  /** Retry on network/timeout errors only */
  networkOnly: (error: unknown): boolean => {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes('econnreset') ||
        msg.includes('econnrefused') ||
        msg.includes('etimedout') ||
        msg.includes('enotfound') ||
        msg.includes('network') ||
        msg.includes('timeout') ||
        msg.includes('socket');
    }
    return false;
  },
  /** Retry on rate-limit (429) and server errors (5xx) */
  rateLimitAndServer: (error: unknown): boolean => {
    if (error instanceof Error) {
      const msg = error.message;
      // HTTP 429 or 5xx
      if (/HTTP 429/.test(msg)) return true;
      if (/HTTP 5\d{2}/.test(msg)) return true;
      // Also check for rate-limit-specific error types
      if (error.name === 'RateLimitError') return true;
    }
    return false;
  },
};
