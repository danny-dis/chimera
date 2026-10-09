// =============================================================================
// ProviderHealthMonitor — tracks provider health (latency, errors, availability)
// for health-aware model selection and routing.
// =============================================================================

export interface HealthSample {
  timestamp: number;
  latencyMs: number;
  success: boolean;
  errorType?: 'timeout' | 'rate_limit' | 'server_error' | 'auth_error' | 'unknown';
}

export interface HealthMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  lastChecked: number;
  lastErrorAt: number | null;
  consecutiveFailures: number;
  available: boolean;
}

export interface HealthMonitorConfig {
  /** Number of recent samples to keep for percentile calculations */
  windowSize?: number;
  /** Error rate threshold (0-1) below which provider is considered healthy */
  healthyThreshold?: number;
  /** Consecutive failures before marking provider as unavailable */
  failureThreshold?: number;
}

const DEFAULT_CONFIG: Required<HealthMonitorConfig> = {
  windowSize: 100,
  healthyThreshold: 0.5,
  failureThreshold: 5,
};

/**
 * ProviderHealthMonitor — tracks provider health for routing decisions.
 * Records latency and error samples, computes percentiles, and determines availability.
 */
export class ProviderHealthMonitor {
  private samples: HealthSample[] = [];
  private config: Required<HealthMonitorConfig>;
  private consecutiveFailures = 0;
  private lastErrorAt: number | null = null;
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;

  constructor(config?: HealthMonitorConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record a successful request.
   */
  recordSuccess(latencyMs: number): void {
    this.totalRequests++;
    this.successfulRequests++;
    this.consecutiveFailures = 0;
    this.addSample({ timestamp: Date.now(), latencyMs, success: true });
  }

  /**
   * Record a failed request.
   */
  recordFailure(latencyMs: number, errorType?: HealthSample['errorType']): void {
    this.totalRequests++;
    this.failedRequests++;
    this.consecutiveFailures++;
    this.lastErrorAt = Date.now();
    this.addSample({ timestamp: Date.now(), latencyMs, success: false, errorType });
  }

  /**
   * Get current health metrics.
   */
  getMetrics(): HealthMetrics {
    const latencies = this.samples.map((s) => s.latencyMs).sort((a, b) => a - b);
    const errorRate = this.totalRequests > 0 ? this.failedRequests / this.totalRequests : 0;

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      errorRate,
      latencyP50Ms: this.percentile(latencies, 0.5),
      latencyP95Ms: this.percentile(latencies, 0.95),
      lastChecked: this.samples.length > 0 ? this.samples[this.samples.length - 1].timestamp : Date.now(),
      lastErrorAt: this.lastErrorAt,
      consecutiveFailures: this.consecutiveFailures,
      available: this.isAvailable(),
    };
  }

  /**
   * Check if the provider is currently available.
   */
  isAvailable(): boolean {
    if (this.consecutiveFailures >= this.config.failureThreshold) {
      return false;
    }
    const errorRate = this.totalRequests > 0 ? this.failedRequests / this.totalRequests : 0;
    return errorRate < this.config.healthyThreshold;
  }

  /**
   * Get the recent error breakdown by type.
   */
  getErrorBreakdown(): Record<string, number> {
    const breakdown: Record<string, number> = {};
    for (const sample of this.samples) {
      if (!sample.success && sample.errorType) {
        breakdown[sample.errorType] = (breakdown[sample.errorType] ?? 0) + 1;
      }
    }
    return breakdown;
  }

  /**
   * Reset all health data.
   */
  reset(): void {
    this.samples = [];
    this.consecutiveFailures = 0;
    this.lastErrorAt = null;
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
  }

  private addSample(sample: HealthSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.config.windowSize) {
      this.samples.shift();
    }
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }
}

// =============================================================================
// MultiProviderHealthMonitor — manages health monitors for multiple providers
// =============================================================================

export class MultiProviderHealthMonitor {
  private monitors = new Map<string, ProviderHealthMonitor>();

  /**
   * Get or create a monitor for a provider.
   */
  getMonitor(providerId: string): ProviderHealthMonitor {
    let monitor = this.monitors.get(providerId);
    if (!monitor) {
      monitor = new ProviderHealthMonitor();
      this.monitors.set(providerId, monitor);
    }
    return monitor;
  }

  /**
   * Record a successful request for a provider.
   */
  recordSuccess(providerId: string, latencyMs: number): void {
    this.getMonitor(providerId).recordSuccess(latencyMs);
  }

  /**
   * Record a failed request for a provider.
   */
  recordFailure(providerId: string, latencyMs: number, errorType?: HealthSample['errorType']): void {
    this.getMonitor(providerId).recordFailure(latencyMs, errorType);
  }

  /**
   * Get metrics for all providers.
   */
  getAllMetrics(): Map<string, HealthMetrics> {
    const result = new Map<string, HealthMetrics>();
    for (const [id, monitor] of this.monitors) {
      result.set(id, monitor.getMetrics());
    }
    return result;
  }

  /**
   * Get available providers.
   */
  getAvailableProviders(): string[] {
    const result: string[] = [];
    for (const [id, monitor] of this.monitors) {
      if (monitor.isAvailable()) {
        result.push(id);
      }
    }
    return result;
  }

  /**
   * Get the healthiest provider (lowest error rate, then lowest latency).
   */
  getHealthiestProvider(): string | null {
    let best: string | null = null;
    let bestScore = -1;

    for (const [id, monitor] of this.monitors) {
      const metrics = monitor.getMetrics();
      if (!metrics.available) continue;
      // Score: higher is better (1 - errorRate normalized, latency inverted)
      const score = (1 - metrics.errorRate) * 1000 / (1 + metrics.latencyP50Ms);
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    return best;
  }
}
