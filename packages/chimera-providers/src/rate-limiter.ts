export interface RateLimitConfig {
  rpm: number;
  tpm: number;
  rpd?: number;
}

interface TimestampedEntry {
  timestamp: number;
  tokens: number;
}

export class RateLimiter {
  private readonly limits: RateLimitConfig;
  private readonly requestLog: TimestampedEntry[] = [];
  private readonly dailyLog: TimestampedEntry[] = [];

  constructor(limits: RateLimitConfig) {
    this.limits = limits;
  }

  async acquire(tokens: number): Promise<void> {
    while (true) {
      const now = Date.now();
      const minuteAgo = now - 60_000;
      const dayAgo = now - 86_400_000;

      const recentRequests = this.requestLog.filter((e) => e.timestamp > minuteAgo);
      const recentTokens = recentRequests.reduce((sum, e) => sum + e.tokens, 0);

      const rpmOk = recentRequests.length < this.limits.rpm;
      const tpmOk = recentTokens + tokens <= this.limits.tpm;

      let rpdOk = true;
      if (this.limits.rpd !== undefined) {
        const dailyRequests = this.dailyLog.filter((e) => e.timestamp > dayAgo);
        rpdOk = dailyRequests.length < this.limits.rpd;
      }

      if (rpmOk && tpmOk && rpdOk) {
        this.requestLog.push({ timestamp: now, tokens });
        this.dailyLog.push({ timestamp: now, tokens });
        this.cleanup(now);
        return;
      }

      const waitMs = this.calculateWaitTime(now, tokens);
      await this.sleep(waitMs);
    }
  }

  getRemaining(): { rpm: number; tpm: number } {
    const now = Date.now();
    const minuteAgo = now - 60_000;

    const recentRequests = this.requestLog.filter((e) => e.timestamp > minuteAgo);
    const recentTokens = recentRequests.reduce((sum, e) => sum + e.tokens, 0);

    return {
      rpm: Math.max(0, this.limits.rpm - recentRequests.length),
      tpm: Math.max(0, this.limits.tpm - recentTokens),
    };
  }

  isThrottled(): boolean {
    const remaining = this.getRemaining();
    const rpmThrottled = remaining.rpm === 0 || remaining.tpm === 0;

    if (this.limits.rpd !== undefined) {
      const now = Date.now();
      const dayAgo = now - 86_400_000;
      const dailyRequests = this.dailyLog.filter((e) => e.timestamp > dayAgo);
      const rpdThrottled = dailyRequests.length >= this.limits.rpd;
      return rpmThrottled || rpdThrottled;
    }

    return rpmThrottled;
  }

  private calculateWaitTime(now: number, tokens: number): number {
    const minuteAgo = now - 60_000;
    const recentRequests = this.requestLog.filter((e) => e.timestamp > minuteAgo);
    const recentTokens = recentRequests.reduce((sum, e) => sum + e.tokens, 0);

    let waitMs = 0;

    if (recentRequests.length >= this.limits.rpm) {
      const oldestInWindow = recentRequests[0]?.timestamp ?? now;
      waitMs = Math.max(waitMs, oldestInWindow + 60_000 - now + 10);
    }

    if (recentTokens + tokens > this.limits.tpm) {
      const oldestInWindow = recentRequests[0]?.timestamp ?? now;
      waitMs = Math.max(waitMs, oldestInWindow + 60_000 - now + 10);
    }

    if (this.limits.rpd !== undefined) {
      const dayAgo = now - 86_400_000;
      const dailyRequests = this.dailyLog.filter((e) => e.timestamp > dayAgo);
      if (dailyRequests.length >= this.limits.rpd) {
        const oldestInDay = dailyRequests[0]?.timestamp ?? now;
        waitMs = Math.max(waitMs, oldestInDay + 86_400_000 - now + 10);
      }
    }

    return Math.max(waitMs, 100);
  }

  private cleanup(now: number): void {
    const minuteAgo = now - 60_000;
    const dayAgo = now - 86_400_000;

    while (this.requestLog.length > 0 && this.requestLog[0].timestamp <= minuteAgo) {
      this.requestLog.shift();
    }
    while (this.dailyLog.length > 0 && this.dailyLog[0].timestamp <= dayAgo) {
      this.dailyLog.shift();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
