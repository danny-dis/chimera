import { type ProviderConfig } from '@chimera/providers';
import { ProviderQuotaTracker } from './provider-quota-tracker';
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
    private readonly HARD_LIMIT;
    private readonly MEMORY_PER_AGENT_MB;
    constructor();
    getQuotaTracker(providerId: string, rpm: number, tpm: number): ProviderQuotaTracker;
    /**
     * Calculates the allowed concurrency level considering system health, provider limits, and overrides.
     */
    getSuggestedConcurrency(providerConfig?: ProviderConfig, overrides?: ConcurrencyOverrides, activeAgentCount?: number): number;
}
//# sourceMappingURL=dynamic-concurrency-engine.d.ts.map