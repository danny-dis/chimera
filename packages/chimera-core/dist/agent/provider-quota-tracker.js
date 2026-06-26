"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderQuotaTracker = void 0;
class ProviderQuotaTracker {
    rpm;
    tpm;
    usedRpm = 0;
    usedTpm = 0;
    lastReset = Date.now();
    constructor(rpm, tpm) {
        this.rpm = rpm;
        this.tpm = tpm;
    }
    /**
     * Updates quota usage based on provider response headers.
     */
    updateUsage(headers) {
        const now = Date.now();
        if (now - this.lastReset > 60000) {
            this.usedRpm = 0;
            this.usedTpm = 0;
            this.lastReset = now;
        }
        const rpmRemaining = parseInt(headers['x-ratelimit-remaining-requests'] || '0');
        const tpmRemaining = parseInt(headers['x-ratelimit-remaining-tokens'] || '0');
        // Simplistic tracker: assume total - remaining = used
        // Providers differ on header names; this can be extended as needed.
        this.usedRpm = Math.max(0, this.rpm - rpmRemaining);
        this.usedTpm = Math.max(0, this.tpm - tpmRemaining);
    }
    /**
     * Reports current quota status.
     */
    getStatus() {
        return {
            rpmRemaining: Math.max(0, this.rpm - this.usedRpm),
            tpmRemaining: Math.max(0, this.tpm - this.usedTpm),
        };
    }
    /**
     * Resets usage counters (should be called on minute rollover).
     */
    reset() {
        this.usedRpm = 0;
        this.usedTpm = 0;
        this.lastReset = Date.now();
    }
}
exports.ProviderQuotaTracker = ProviderQuotaTracker;
//# sourceMappingURL=provider-quota-tracker.js.map