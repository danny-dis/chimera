import os from 'os';
import { ConcurrencyGovernor, GovernorMetrics } from './concurrency-governor';
import { type ProviderConfig } from '@chimera/providers';
import { EventLoopMonitor } from './event-loop-monitor';
import { ProviderQuotaTracker } from './provider-quota-tracker';

export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 500;
const DEFAULT_RECALCULATION_INTERVAL_MS = 5000;

export type ConcurrencyMode = 'default' | 'high' | 'interactive';

export interface ConcurrencyOverrides {
  mode?: ConcurrencyMode;
  explicitLimit?: number;
}

export class DynamicConcurrencyEngine {
  private governor: ConcurrencyGovernor;
  private loopMonitor: EventLoopMonitor;
  private quotaTrackers: Map<string, ProviderQuotaTracker> = new Map();
  private readonly DEFAULT_SOFT_LIMIT = 5;
  private readonly MEMORY_PER_AGENT_MB = 10;
  private recalculationTimer: ReturnType<typeof setInterval> | null = null;
  private lastSuggestedConcurrency: number = MIN_CONCURRENCY;
  private recalculationListeners: Set<(concurrency: number) => void> = new Set();

  constructor() {
    this.governor = new ConcurrencyGovernor({
      baseConcurrency: this.DEFAULT_SOFT_LIMIT,
      maxConcurrency: MAX_CONCURRENCY,
    });
    this.loopMonitor = new EventLoopMonitor();
  }

  getQuotaTracker(providerId: string, rpm: number, tpm: number): ProviderQuotaTracker {
    if (!this.quotaTrackers.has(providerId)) {
      this.quotaTrackers.set(providerId, new ProviderQuotaTracker(rpm, tpm));
    }
    return this.quotaTrackers.get(providerId)!;
  }

  /**
   * Calculates the allowed concurrency level considering system health, provider limits, and overrides.
   */
  getSuggestedConcurrency(
    providerConfig?: ProviderConfig,
    overrides?: ConcurrencyOverrides,
    activeAgentCount: number = 0
  ): number {
    const metrics: Partial<GovernorMetrics> = {
      cpuLoad: os.loadavg()[0],
      freeMem: os.freemem(),
      backpressure: this.loopMonitor.isOverloaded(),
    };

    let suggested = this.governor.suggestConcurrency(metrics);

    // Dynamic memory-based cap
    const estimatedMemoryUsage = activeAgentCount * this.MEMORY_PER_AGENT_MB * 1024 * 1024;
    if (os.freemem() < estimatedMemoryUsage) {
      suggested = Math.max(1, Math.floor(suggested * 0.5));
    }

    // Apply soft limit as base if no override forces it higher
    if (!overrides || (!overrides.mode && !overrides.explicitLimit)) {
      suggested = Math.min(suggested, this.DEFAULT_SOFT_LIMIT);
    }

    // Handle overrides
    if (overrides?.explicitLimit) {
      suggested = Math.max(suggested, overrides.explicitLimit);
    } else if (overrides?.mode === 'high') {
      suggested = Math.max(suggested, this.DEFAULT_SOFT_LIMIT * 5);
    } else if (overrides?.mode === 'interactive') {
      suggested = Math.max(suggested, this.DEFAULT_SOFT_LIMIT * 2);
    }

    // Apply provider constraint if available (Hard cap)
    if (providerConfig?.constraints?.maxParallelInstances) {
      suggested = Math.min(suggested, providerConfig.constraints.maxParallelInstances);
    }

    // Apply provider quota limits
    if (providerConfig) {
      const tracker = this.getQuotaTracker(
        providerConfig.name, 
        providerConfig.constraints.rateLimitRpm,
        providerConfig.constraints.maxTokensPerTurn * 100 // Approximation
      );
      const quota = tracker.getStatus();
      suggested = Math.min(suggested, Math.max(1, Math.floor(quota.rpmRemaining / 10)));
    }

    // Always enforce hard safety bounds
    this.lastSuggestedConcurrency = Math.max(MIN_CONCURRENCY, Math.min(suggested, MAX_CONCURRENCY));
    return this.lastSuggestedConcurrency;
  }

  recalculate(
    providerConfig?: ProviderConfig,
    overrides?: ConcurrencyOverrides,
    activeAgentCount: number = 0,
  ): number {
    const concurrency = this.getSuggestedConcurrency(providerConfig, overrides, activeAgentCount);
    for (const listener of this.recalculationListeners) {
      listener(concurrency);
    }
    return concurrency;
  }

  startRecalculation(intervalMs: number = DEFAULT_RECALCULATION_INTERVAL_MS): void {
    if (this.recalculationTimer !== null) {
      return;
    }
    this.recalculationTimer = setInterval(() => {
      this.recalculate();
    }, intervalMs);
  }

  stopRecalculation(): void {
    if (this.recalculationTimer !== null) {
      clearInterval(this.recalculationTimer);
      this.recalculationTimer = null;
    }
  }

  onRecalculation(listener: (concurrency: number) => void): () => void {
    this.recalculationListeners.add(listener);
    return () => {
      this.recalculationListeners.delete(listener);
    };
  }

  getLastSuggestedConcurrency(): number {
    return this.lastSuggestedConcurrency;
  }
}
