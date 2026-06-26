/**
 * Tracks and manages provider-specific API quotas (RPM/TPM).
 */
export interface QuotaStatus {
    rpmRemaining: number;
    tpmRemaining: number;
}
export declare class ProviderQuotaTracker {
    private rpm;
    private tpm;
    private usedRpm;
    private usedTpm;
    private lastReset;
    constructor(rpm: number, tpm: number);
    /**
     * Updates quota usage based on provider response headers.
     */
    updateUsage(headers: Record<string, string>): void;
    /**
     * Reports current quota status.
     */
    getStatus(): QuotaStatus;
    /**
     * Resets usage counters (should be called on minute rollover).
     */
    reset(): void;
}
//# sourceMappingURL=provider-quota-tracker.d.ts.map