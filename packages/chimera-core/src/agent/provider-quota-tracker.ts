/**
 * Tracks and manages provider-specific API quotas (RPM/TPM).
 */
export interface QuotaStatus {
  rpmRemaining: number;
  tpmRemaining: number;
}

export class ProviderQuotaTracker {
  private rpm: number;
  private tpm: number;
  private usedRpm: number = 0;
  private usedTpm: number = 0;
  private lastReset: number = Date.now();

  constructor(rpm: number, tpm: number) {
    this.rpm = rpm;
    this.tpm = tpm;
  }

  /**
   * Updates quota usage based on provider response headers.
   */
  updateUsage(headers: Record<string, string>): void {
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
  getStatus(): QuotaStatus {
    return {
      rpmRemaining: Math.max(0, this.rpm - this.usedRpm),
      tpmRemaining: Math.max(0, this.tpm - this.usedTpm),
    };
  }

  /**
   * Resets usage counters (should be called on minute rollover).
   */
  reset(): void {
    this.usedRpm = 0;
    this.usedTpm = 0;
    this.lastReset = Date.now();
  }
}
