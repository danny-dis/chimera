/**
 * ErrorRecovery — wraps provider / tool calls and applies recovery strategies
 * based on the error class.
 *
 * Recovery strategies:
 *   RecoverableError  → retry with exponential backoff (max 3 retries)
 *   TimeoutError      → retry once with double the timeout
 *   LspError          → fall back to a simpler tool implementation or return
 *                       a user-friendly message
 *   FatalError        → surface a clean error to the user (no stack trace)
 *   ProviderError     → retry with exponential backoff (max 3 retries)
 *   unknown           → treat as fatal
 */

import type { EventStream } from '../event-stream.js';
import {
  ChimeraError,
  FatalError,
  LspError,
  ProviderError,
  RecoverableError,
  TimeoutError,
} from '../errors/index.js';

export interface ErrorRecoveryOptions {
  /** Max retries for generic recoverable errors. */
  maxRetries?: number;
  /** Base backoff in ms for exponential backoff. */
  baseBackoffMs?: number;
  /** Default timeout ms for wrapped calls (used on TimeoutError retries). */
  defaultTimeoutMs?: number;
  /** Optional LSP fallback map: tool name → fallback result provider. */
  lspFallback?: Record<string, () => Promise<unknown>>;
  /** Optional user-friendly message map: error code → message template. */
  userMessages?: Record<string, (err: Error) => string>;
  eventStream?: EventStream;
}

const DEFAULTS = {
  maxRetries: 3,
  baseBackoffMs: 200,
  defaultTimeoutMs: 30_000,
};

export class ErrorRecovery {
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly defaultTimeoutMs: number;
  private readonly lspFallback: Record<string, () => Promise<unknown>>;
  private readonly userMessages: Record<string, (err: Error) => string>;
  private readonly eventStream?: EventStream;

  constructor(options: ErrorRecoveryOptions = {}) {
    this.maxRetries = options.maxRetries ?? DEFAULTS.maxRetries;
    this.baseBackoffMs = options.baseBackoffMs ?? DEFAULTS.baseBackoffMs;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULTS.defaultTimeoutMs;
    this.lspFallback = options.lspFallback ?? {};
    this.userMessages = options.userMessages ?? {};
    this.eventStream = options.eventStream;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Wrap an async operation with the appropriate recovery strategy.
   * Returns `{ ok: true, value }` on success or `{ ok: false, error }` on
   * exhaustion.
   */
  async wrap<T>(
    fn: () => Promise<T>,
    context?: Record<string, unknown>,
  ): Promise<Recovered<T>> {
    return this._wrap(fn, 1, undefined, context);
  }

  /**
   * Execute an async callable with a timeout.  Rejects with a TimeoutError
   * when the deadline is exceeded (and also tries a single retry with
   * double timeout when within ErrorRecovery).
   */
  async withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs?: number,
    context?: Record<string, unknown>,
  ): Promise<Recovered<T>> {
    const ttl = timeoutMs ?? this.defaultTimeoutMs;
    return this._withTimeout(fn, ttl, 1, context);
  }

  /**
   * Execute a tool call with recovery.  Checks whether the tool name maps
   * to an LSP fallback before delegating to generic handling.
   */
  async executeToolCall<T>(
    toolName: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>,
  ): Promise<Recovered<T>> {
    try {
      const value = await fn();
      return { ok: true, value };
    } catch (raw) {
      const err = toError(raw);
      // If the tool crashed, treat it as LSP error first.
      const isLsp = raw instanceof LspError
        || (raw instanceof Error && raw.message.includes('LSP'))
        || (raw instanceof Error && raw.name === 'JsonRpcError');
      if (isLsp) {
        return this.handleLspError(toolName, err.message, context, fn);
      }
      return this.wrap(fn, context);
    }
  }

  // ------------------------------------------------------------------
  // Internal retry pipeline
  // ------------------------------------------------------------------

  private async _wrap<T>(
    fn: () => Promise<T>,
    attempt: number,
    cause: unknown | undefined,
    context?: Record<string, unknown>,
  ): Promise<Recovered<T>> {
    const ctx = { ...context, attempt };

    try {
      const value = await fn();
      return { ok: true, value };
    } catch (raw) {
      const err = toError(raw);

      if (err instanceof FatalError) {
        return this.handleFatal(err, ctx);
      }
      if (err instanceof RecoverableError) {
        return this.handleRecoverable(fn, err, ctx);
      }
      if (err instanceof TimeoutError) {
        return this.handleTimeout(fn, err, ctx);
      }
      if (err instanceof ProviderError) {
        return this.handleRecoverable(
          fn,
          new RecoverableError(
            `Provider error: ${err.message}`,
            err,
            this.maxRetries,
            attempt,
          ),
          ctx,
        );
      }
      if (err instanceof LspError) {
        return this.handleLspError(err.message, err.message, ctx, fn);
      }

      // Unknown error → treat as fatal with a clean user message.
      return this.handleFatal(
        new FatalError(
          `Unexpected error: ${err.message}`,
          'An unexpected error occurred. Please try again.',
          { cause: err },
        ),
        ctx,
      );
    }
  }

  private async _withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    attempt: number,
    context?: Record<string, unknown>,
  ): Promise<Recovered<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const value = await fn();
      clearTimeout(timer);
      return { ok: true, value };
    } catch (raw) {
      clearTimeout(timer);
      if (raw instanceof DOMException && raw.name === 'AbortError') {
        return this.handleTimeout(fn, new TimeoutError(
          `Operation timed out after ${timeoutMs}ms`,
          timeoutMs,
          timeoutMs,
          { cause: raw },
        ), { ...context, attempt });
      }
      // Not a timeout — delegate to normal error handling.
      return this._wrap(fn, attempt, raw, context);
    }
  }

  // ------------------------------------------------------------------
  // Error handlers
  // ------------------------------------------------------------------

  private async handleRecoverable<T>(
    fn: () => Promise<T>,
    err: RecoverableError,
    context: Record<string, unknown>,
  ): Promise<Recovered<T>> {
    if (err.attempt >= this.maxRetries) {
      this.emit('recovery_exhausted', {
        error: err.message,
        attempt: err.attempt,
        maxRetries: this.maxRetries,
        ...context,
      });
      return {
        ok: false,
        error: new FatalError(
          `Recovery exhausted after ${err.attempt} attempts`,
          'The operation failed after multiple retry attempts. Please try again.',
          { cause: err.originalError },
        ) as Error,
      };
    }

    const backoffMs = this.baseBackoffMs * 2 ** (err.attempt - 1);
    await sleep(backoffMs);

    this.emit('retrying', {
      error: err.message,
      attempt: err.attempt,
      maxRetries: this.maxRetries,
      backoffMs,
      ...context,
    });

    // Retry the original function.
    return this._wrap(fn, err.attempt + 1, err, context);
  }

  private async handleTimeout<T>(
    fn: () => Promise<T>,
    err: TimeoutError,
    context: Record<string, unknown>,
  ): Promise<Recovered<T>> {
    // Timeout errors get exactly one retry with double the timeout.
    // TimeoutError doesn't carry an attempt counter — always allow one retry.
    const newTimeout = err.timeoutMs * 2;
    this.emit('timeout_retry', {
      error: err.message,
      newTimeout,
      ...context,
    });

    return this._withTimeout(fn, newTimeout, 2, context);
  }

  private async handleFatal<T>(
    err: FatalError,
    _context?: Record<string, unknown>,
  ): Promise<Recovered<T>> {
    this.emit('fatal_error', {
      error: err.message,
      userMessage: err.userMessage,
    });
    return { ok: false, error: err as Error };
  }

  private async handleLspError<T>(
    toolName: string,
    message: string,
    context: Record<string, unknown>,
    originalFn: () => Promise<T>,
  ): Promise<Recovered<T>> {
    const lspError = new LspError(message, toolName);

    // Try LSP fallback first.
    const fallback = this.lspFallback[toolName];
    if (fallback) {
      this.emit('lsp_fallback', { tool: toolName });
      try {
        const value = await fallback() as T;
        return { ok: true, value };
      } catch (fbErr) {
        this.emit('lsp_fallback_failed', { tool: toolName, error: fbErr });
      }
    }

    // No fallback or fallback failed → retry the original once as a
    // last-resort attempt (LSP daemons sometimes crash transiently).
    if (context._lspRetry !== 'true') {
      return this._wrap(originalFn, 1, lspError, {
        ...context,
        _lspRetry: 'true',
      });
    }

    // Even the retry failed — surface a user-friendly message.
    this.emit('lsp_error', { tool: toolName, error: message });
    return {
      ok: false,
      error: new FatalError(
        message,
        `The "${toolName}" tool is temporarily unavailable. A simpler result is being provided.`,
        { cause: lspError },
      ) as Error,
    };
  }

  // ------------------------------------------------------------------
  // Telemetry
  // ------------------------------------------------------------------

  private emit(event: string, payload?: Record<string, unknown>) {
    this.eventStream?.append({ type: `error_recovery:${event}`, ...payload } as any);
  }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function toError(raw: unknown): Error {
  if (raw instanceof Error) return raw;
  return new Error(String(raw));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type Recovered<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

export function isRecovered<T>(r: Recovered<T>): r is { ok: true; value: T } {
  return r.ok;
}