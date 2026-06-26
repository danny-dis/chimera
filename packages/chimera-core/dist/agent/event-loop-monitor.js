"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventLoopMonitor = void 0;
/**
 * Monitors event loop lag to gauge system responsiveness.
 */
class EventLoopMonitor {
    lastTime;
    lag = 0;
    threshold;
    constructor(thresholdMs = 100) {
        this.threshold = thresholdMs;
        this.lastTime = Date.now();
        this.monitor();
    }
    monitor() {
        const now = Date.now();
        this.lag = Math.max(0, now - this.lastTime - 100); // Expect 100ms intervals
        this.lastTime = now;
        // Schedule next check
        setTimeout(() => this.monitor(), 100);
    }
    /**
     * Returns current event loop lag in milliseconds.
     */
    getLag() {
        return this.lag;
    }
    /**
     * Checks if the system is overloaded based on event loop lag.
     */
    isOverloaded() {
        return this.lag > this.threshold;
    }
}
exports.EventLoopMonitor = EventLoopMonitor;
//# sourceMappingURL=event-loop-monitor.js.map