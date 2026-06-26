export declare class ProviderError extends Error {
    readonly provider?: string | undefined;
    readonly statusCode?: number | undefined;
    constructor(message: string, provider?: string | undefined, statusCode?: number | undefined);
}
export declare class RateLimitError extends ProviderError {
    readonly retryAfter?: number | undefined;
    constructor(message: string, retryAfter?: number | undefined, provider?: string);
}
export declare class QuotaExceededError extends ProviderError {
    constructor(message: string, provider?: string);
}
export declare class ProviderUnavailableError extends ProviderError {
    constructor(message: string, provider?: string);
}
export declare class InvalidConfigError extends ProviderError {
    constructor(message: string, provider?: string);
}
export declare class StreamingError extends ProviderError {
    constructor(message: string, provider?: string);
}
//# sourceMappingURL=errors.d.ts.map