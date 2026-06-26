/**
 * A simple asynchronous semaphore to control concurrency.
 */
export declare class AsyncSemaphore {
    private permits;
    private queue;
    constructor(permits: number);
    /**
     * Acquires a permit. Waits if no permits are available.
     */
    acquire(): Promise<void>;
    /**
     * Releases a permit.
     */
    release(): void;
    /**
     * Returns the current number of available permits.
     */
    getAvailablePermits(): number;
}
//# sourceMappingURL=async-semaphore.d.ts.map