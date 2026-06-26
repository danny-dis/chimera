/**
 * A simple asynchronous semaphore to control concurrency.
 */
export class AsyncSemaphore {
  private permits: number;
  private queue: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  /**
   * Acquires a permit. Waits if no permits are available.
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  /**
   * Releases a permit.
   */
  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.permits++;
    }
  }

  /**
   * Returns the current number of available permits.
   */
  getAvailablePermits(): number {
    return this.permits;
  }
}
