/**
 * Monitors event loop lag to gauge system responsiveness.
 */
export class EventLoopMonitor {
  private lastTime: number;
  private lag: number = 0;
  private readonly threshold: number;

  constructor(thresholdMs: number = 100) {
    this.threshold = thresholdMs;
    this.lastTime = Date.now();
    this.monitor();
  }

  private monitor() {
    const now = Date.now();
    this.lag = Math.max(0, now - this.lastTime - 100); // Expect 100ms intervals
    this.lastTime = now;
    
    // Schedule next check
    setTimeout(() => this.monitor(), 100);
  }

  /**
   * Returns current event loop lag in milliseconds.
   */
  getLag(): number {
    return this.lag;
  }

  /**
   * Checks if the system is overloaded based on event loop lag.
   */
  isOverloaded(): boolean {
    return this.lag > this.threshold;
  }
}
