import { describe, it, expect } from 'vitest';
import {
  ProviderError,
  RateLimitError,
  QuotaExceededError,
  ProviderUnavailableError,
  InvalidConfigError,
  StreamingError,
} from '../errors.js';

describe('ProviderError', () => {
  it('creates with message', () => {
    const error = new ProviderError('test error');
    expect(error.message).toBe('test error');
    expect(error.name).toBe('ProviderError');
    expect(error.provider).toBeUndefined();
    expect(error.statusCode).toBeUndefined();
  });

  it('creates with provider and status code', () => {
    const error = new ProviderError('not found', 'openai', 404);
    expect(error.provider).toBe('openai');
    expect(error.statusCode).toBe(404);
  });
});

describe('RateLimitError', () => {
  it('creates with retryAfter', () => {
    const error = new RateLimitError('rate limited', 30, 'anthropic');
    expect(error.name).toBe('RateLimitError');
    expect(error.retryAfter).toBe(30);
    expect(error.provider).toBe('anthropic');
    expect(error.statusCode).toBe(429);
  });

  it('creates without retryAfter', () => {
    const error = new RateLimitError('rate limited');
    expect(error.retryAfter).toBeUndefined();
  });

  it('extends ProviderError', () => {
    const error = new RateLimitError('test');
    expect(error).toBeInstanceOf(ProviderError);
  });
});

describe('QuotaExceededError', () => {
  it('creates with provider', () => {
    const error = new QuotaExceededError('quota exceeded', 'google');
    expect(error.name).toBe('QuotaExceededError');
    expect(error.provider).toBe('google');
    expect(error.statusCode).toBe(429);
  });

  it('extends ProviderError', () => {
    expect(new QuotaExceededError('test')).toBeInstanceOf(ProviderError);
  });
});

describe('ProviderUnavailableError', () => {
  it('creates with provider', () => {
    const error = new ProviderUnavailableError('server down', 'ollama');
    expect(error.name).toBe('ProviderUnavailableError');
    expect(error.provider).toBe('ollama');
    expect(error.statusCode).toBe(503);
  });

  it('extends ProviderError', () => {
    expect(new ProviderUnavailableError('test')).toBeInstanceOf(ProviderError);
  });
});

describe('InvalidConfigError', () => {
  it('creates with provider', () => {
    const error = new InvalidConfigError('bad config', 'openai');
    expect(error.name).toBe('InvalidConfigError');
    expect(error.provider).toBe('openai');
  });

  it('extends ProviderError', () => {
    expect(new InvalidConfigError('test')).toBeInstanceOf(ProviderError);
  });
});

describe('StreamingError', () => {
  it('creates with provider', () => {
    const error = new StreamingError('stream broke', 'anthropic');
    expect(error.name).toBe('StreamingError');
    expect(error.provider).toBe('anthropic');
  });

  it('extends ProviderError', () => {
    expect(new StreamingError('test')).toBeInstanceOf(ProviderError);
  });
});
