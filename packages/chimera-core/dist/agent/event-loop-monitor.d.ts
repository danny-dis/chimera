/**
 * Monitors event loop lag to gauge system responsiveness.
 */
export declare class EventLoopMonitor {
    private lastTime;
    private lag;
    private readonly threshold;
    constructor(thresholdMs?: number);
    private monitor;
    /**
     * Returns current event loop lag in milliseconds.
     */
    getLag(): number;
    /**
     * Checks if the system is overloaded based on event loop lag.
     */
    isOverloaded(): boolean;
}
//# sourceMappingURL=event-loop-monitor.d.ts.map