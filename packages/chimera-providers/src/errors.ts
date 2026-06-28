export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider?: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class RateLimitError extends ProviderError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    provider?: string,
  ) {
    super(message, provider, 429);
    this.name = 'RateLimitError';
  }
}

export class QuotaExceededError extends ProviderError {
  constructor(message: string, provider?: string) {
    super(message, provider, 429);
    this.name = 'QuotaExceededError';
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(message: string, provider?: string) {
    super(message, provider, 503);
    this.name = 'ProviderUnavailableError';
  }
}

export class InvalidConfigError extends ProviderError {
  constructor(message: string, provider?: string) {
    super(message, provider);
    this.name = 'InvalidConfigError';
  }
}

export class StreamingError extends ProviderError {
  constructor(message: string, provider?: string) {
    super(message, provider);
    this.name = 'StreamingError';
  }
}

export class NoProviderConfiguredError extends ProviderError {
  public readonly checkedLocations: string[];
  
  constructor(message: string, checkedLocations: string[] = [], provider?: string) {
    super(message, provider);
    this.name = 'NoProviderConfiguredError';
    this.checkedLocations = checkedLocations;
  }
}
