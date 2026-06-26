export interface GovernorMetrics {
    cpuLoad: number;
    freeMem: number;
    queueSize: number;
    backpressure: boolean;
}
export interface GovernorConfig {
    maxCpuLoad: number;
    minFreeMem: number;
    baseConcurrency: number;
    maxConcurrency: number;
}
/**
 * ConcurrencyGovernor suggests optimal concurrency levels based on system health.
 */
export declare class ConcurrencyGovernor {
    private config;
    constructor(config?: Partial<GovernorConfig>);
    /**
     * Calculates the suggested concurrency level.
     */
    suggestConcurrency(metrics: Partial<GovernorMetrics>): number;
    private getAvgCpuLoad;
}
//# sourceMappingURL=concurrency-governor.d.ts.map