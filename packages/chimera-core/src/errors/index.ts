/**
 * Chimera error hierarchy — shared across core and providers.
 *
 * Every error carries a `recoverable` flag so the ErrorRecovery layer can
 * decide whether to retry / fallback or surface a clean message to the user.
 */

export class ChimeraError extends Error {
  /** Whether this error can be recovered without user intervention. */
  recoverable: boolean;

  constructor(
    message: string,
    public readonly code: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ChimeraError';
    this.recoverable = false;
  }
}

/** A provider returned a non-2xx response or became unreachable. */
export class ProviderError extends ChimeraError {
  readonly recoverable = true;

  constructor(
    message: string,
    public readonly provider?: string,
    public readonly statusCode?: number,
    options?: { cause?: unknown },
  ) {
    super(message, 'CHIMERA_PROVIDER_ERROR', options);
    this.name = 'ProviderError';
  }
}

/** An operation did not finish within the allotted time. */
export class TimeoutError extends ChimeraError {
  readonly recoverable = true;

  constructor(
    message: string,
    public readonly elapsedMs: number,
    public readonly timeoutMs: number,
    options?: { cause?: unknown },
  ) {
    super(message, 'CHIMERA_TIMEOUT_ERROR', options);
    this.name = 'TimeoutError';
  }
}

/** An LSP daemon crashed or returned invalid JSON-RPC. */
export class LspError extends ChimeraError {
  readonly recoverable = true;

  constructor(
    message: string,
    public readonly tool?: string,
    options?: { cause?: unknown },
  ) {
    super(message, 'CHIMERA_LSP_ERROR', options);
    this.name = 'LspError';
  }
}

/** A wrapper around a recoverable error that carries retry metadata. */
export class RecoverableError extends ChimeraError {
  readonly recoverable = true;

  constructor(
    message: string,
    public readonly originalError: Error,
    /** Maximum number of retry attempts (including the first). */
    public readonly maxRetries: number = 3,
    /** How many retries have been consumed so far. */
    public readonly attempt: number = 1,
    options?: { cause?: unknown },
  ) {
    super(message, 'CHIMERA_RECOVERABLE_ERROR', options);
    this.name = 'RecoverableError';
  }
}

/** An unrecoverable condition — surface a clean error to the user. */
export class FatalError extends ChimeraError {
  readonly recoverable = false;

  constructor(
    message: string,
    public readonly userMessage: string = message,
    options?: { cause?: unknown },
  ) {
    super(message, 'CHIMERA_FATAL_ERROR', options);
    this.name = 'FatalError';
  }
}