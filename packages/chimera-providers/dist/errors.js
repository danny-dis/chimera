"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoProviderConfiguredError = exports.StreamingError = exports.InvalidConfigError = exports.ProviderUnavailableError = exports.QuotaExceededError = exports.RateLimitError = exports.ProviderError = void 0;
class ProviderError extends Error {
    provider;
    statusCode;
    constructor(message, provider, statusCode) {
        super(message);
        this.provider = provider;
        this.statusCode = statusCode;
        this.name = 'ProviderError';
    }
}
exports.ProviderError = ProviderError;
class RateLimitError extends ProviderError {
    retryAfter;
    constructor(message, retryAfter, provider) {
        super(message, provider, 429);
        this.retryAfter = retryAfter;
        this.name = 'RateLimitError';
    }
}
exports.RateLimitError = RateLimitError;
class QuotaExceededError extends ProviderError {
    constructor(message, provider) {
        super(message, provider, 429);
        this.name = 'QuotaExceededError';
    }
}
exports.QuotaExceededError = QuotaExceededError;
class ProviderUnavailableError extends ProviderError {
    constructor(message, provider) {
        super(message, provider, 503);
        this.name = 'ProviderUnavailableError';
    }
}
exports.ProviderUnavailableError = ProviderUnavailableError;
class InvalidConfigError extends ProviderError {
    constructor(message, provider) {
        super(message, provider);
        this.name = 'InvalidConfigError';
    }
}
exports.InvalidConfigError = InvalidConfigError;
class StreamingError extends ProviderError {
    constructor(message, provider) {
        super(message, provider);
        this.name = 'StreamingError';
    }
}
exports.StreamingError = StreamingError;
class NoProviderConfiguredError extends ProviderError {
    checkedLocations;
    constructor(message, checkedLocations = [], provider) {
        super(message, provider);
        this.name = 'NoProviderConfiguredError';
        this.checkedLocations = checkedLocations;
    }
}
exports.NoProviderConfiguredError = NoProviderConfiguredError;
//# sourceMappingURL=errors.js.map