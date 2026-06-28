"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicConcurrencyEngine = exports.MAX_CONCURRENCY = exports.MIN_CONCURRENCY = void 0;
const os_1 = __importDefault(require("os"));
const concurrency_governor_1 = require("./concurrency-governor");
const event_loop_monitor_1 = require("./event-loop-monitor");
const provider_quota_tracker_1 = require("./provider-quota-tracker");
exports.MIN_CONCURRENCY = 1;
exports.MAX_CONCURRENCY = 500;
const DEFAULT_RECALCULATION_INTERVAL_MS = 5000;
class DynamicConcurrencyEngine {
    governor;
    loopMonitor;
    quotaTrackers = new Map();
    DEFAULT_SOFT_LIMIT = 5;
    MEMORY_PER_AGENT_MB = 10;
    recalculationTimer = null;
    lastSuggestedConcurrency = exports.MIN_CONCURRENCY;
    recalculationListeners = new Set();
    constructor() {
        this.governor = new concurrency_governor_1.ConcurrencyGovernor({
            baseConcurrency: this.DEFAULT_SOFT_LIMIT,
            maxConcurrency: exports.MAX_CONCURRENCY,
        });
        this.loopMonitor = new event_loop_monitor_1.EventLoopMonitor();
    }
    getQuotaTracker(providerId, rpm, tpm) {
        if (!this.quotaTrackers.has(providerId)) {
            this.quotaTrackers.set(providerId, new provider_quota_tracker_1.ProviderQuotaTracker(rpm, tpm));
        }
        return this.quotaTrackers.get(providerId);
    }
    /**
     * Calculates the allowed concurrency level considering system health, provider limits, and overrides.
     */
    getSuggestedConcurrency(providerConfig, overrides, activeAgentCount = 0) {
        const metrics = {
            cpuLoad: os_1.default.loadavg()[0],
            freeMem: os_1.default.freemem(),
            backpressure: this.loopMonitor.isOverloaded(),
        };
        let suggested = this.governor.suggestConcurrency(metrics);
        // Dynamic memory-based cap
        const estimatedMemoryUsage = activeAgentCount * this.MEMORY_PER_AGENT_MB * 1024 * 1024;
        if (os_1.default.freemem() < estimatedMemoryUsage) {
            suggested = Math.max(1, Math.floor(suggested * 0.5));
        }
        // Apply soft limit as base if no override forces it higher
        if (!overrides || (!overrides.mode && !overrides.explicitLimit)) {
            suggested = Math.min(suggested, this.DEFAULT_SOFT_LIMIT);
        }
        // Handle overrides
        if (overrides?.explicitLimit) {
            suggested = Math.max(suggested, overrides.explicitLimit);
        }
        else if (overrides?.mode === 'high') {
            suggested = Math.max(suggested, this.DEFAULT_SOFT_LIMIT * 5);
        }
        else if (overrides?.mode === 'interactive') {
            suggested = Math.max(suggested, this.DEFAULT_SOFT_LIMIT * 2);
        }
        // Apply provider constraint if available (Hard cap)
        if (providerConfig?.constraints?.maxParallelInstances) {
            suggested = Math.min(suggested, providerConfig.constraints.maxParallelInstances);
        }
        // Apply provider quota limits
        if (providerConfig) {
            const tracker = this.getQuotaTracker(providerConfig.name, providerConfig.constraints.rateLimitRpm, providerConfig.constraints.maxTokensPerTurn * 100 // Approximation
            );
            const quota = tracker.getStatus();
            suggested = Math.min(suggested, Math.max(1, Math.floor(quota.rpmRemaining / 10)));
        }
        // Always enforce hard safety bounds
        this.lastSuggestedConcurrency = Math.max(exports.MIN_CONCURRENCY, Math.min(suggested, exports.MAX_CONCURRENCY));
        return this.lastSuggestedConcurrency;
    }
    recalculate(providerConfig, overrides, activeAgentCount = 0) {
        const concurrency = this.getSuggestedConcurrency(providerConfig, overrides, activeAgentCount);
        for (const listener of this.recalculationListeners) {
            listener(concurrency);
        }
        return concurrency;
    }
    startRecalculation(intervalMs = DEFAULT_RECALCULATION_INTERVAL_MS) {
        if (this.recalculationTimer !== null) {
            return;
        }
        this.recalculationTimer = setInterval(() => {
            this.recalculate();
        }, intervalMs);
    }
    stopRecalculation() {
        if (this.recalculationTimer !== null) {
            clearInterval(this.recalculationTimer);
            this.recalculationTimer = null;
        }
    }
    onRecalculation(listener) {
        this.recalculationListeners.add(listener);
        return () => {
            this.recalculationListeners.delete(listener);
        };
    }
    getLastSuggestedConcurrency() {
        return this.lastSuggestedConcurrency;
    }
}
exports.DynamicConcurrencyEngine = DynamicConcurrencyEngine;
//# sourceMappingURL=dynamic-concurrency-engine.js.map