"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsyncSemaphore = void 0;
/**
 * A simple asynchronous semaphore to control concurrency.
 */
class AsyncSemaphore {
    permits;
    queue = [];
    constructor(permits) {
        this.permits = permits;
    }
    /**
     * Acquires a permit. Waits if no permits are available.
     */
    async acquire() {
        if (this.permits > 0) {
            this.permits--;
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.queue.push(resolve);
        });
    }
    /**
     * Releases a permit.
     */
    release() {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            if (next)
                next();
        }
        else {
            this.permits++;
        }
    }
    /**
     * Returns the current number of available permits.
     */
    getAvailablePermits() {
        return this.permits;
    }
}
exports.AsyncSemaphore = AsyncSemaphore;
//# sourceMappingURL=async-semaphore.js.map