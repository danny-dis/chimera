import { type ProviderConfig } from '@chimera/providers';
import { ProviderQuotaTracker } from './provider-quota-tracker';
export declare const MIN_CONCURRENCY = 1;
export declare const MAX_CONCURRENCY = 500;
export type ConcurrencyMode = 'default' | 'high' | 'interactive';
export interface ConcurrencyOverrides {
    mode?: ConcurrencyMode;
    explicitLimit?: number;
}
export declare class DynamicConcurrencyEngine {
    private governor;
    private loopMonitor;
    private quotaTrackers;
    private readonly DEFAULT_SOFT_LIMIT;
    private readonly MEMORY_PER_AGENT_MB;
    private recalculationTimer;
    private lastSuggestedConcurrency;
    private recalculationListeners;
    constructor();
    getQuotaTracker(providerId: string, rpm: number, tpm: number): ProviderQuotaTracker;
    /**
     * Calculates the allowed concurrency level considering system health, provider limits, and overrides.
     */
    getSuggestedConcurrency(providerConfig?: ProviderConfig, overrides?: ConcurrencyOverrides, activeAgentCount?: number): number;
    recalculate(providerConfig?: ProviderConfig, overrides?: ConcurrencyOverrides, activeAgentCount?: number): number;
    startRecalculation(intervalMs?: number): void;
    stopRecalculation(): void;
    onRecalculation(listener: (concurrency: number) => void): () => void;
    getLastSuggestedConcurrency(): number;
}
//# sourceMappingURL=dynamic-concurrency-engine.d.ts.map