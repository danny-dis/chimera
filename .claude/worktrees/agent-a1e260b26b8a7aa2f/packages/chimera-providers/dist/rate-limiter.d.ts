export interface RateLimitConfig {
    rpm: number;
    tpm: number;
    rpd?: number;
}
export declare class RateLimiter {
    private readonly limits;
    private readonly requestLog;
    private readonly dailyLog;
    constructor(limits: RateLimitConfig);
    acquire(tokens: number): Promise<void>;
    getRemaining(): {
        rpm: number;
        tpm: number;
    };
    isThrottled(): boolean;
    private calculateWaitTime;
    private cleanup;
    private sleep;
}
//# sourceMappingURL=rate-limiter.d.ts.map