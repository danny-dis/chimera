"use strict";
/**
 * Idle timeout utility for workflow node execution.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.STEP_IDLE_TIMEOUT_MS = void 0;
exports.withIdleTimeout = withIdleTimeout;
/** Default idle timeout for workflow steps (5 minutes in ms). */
exports.STEP_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
/**
 * Wrap a promise with an idle timeout.
 * If the promise doesn't resolve within timeoutMs, rejects with timeout error.
 */
async function withIdleTimeout(promise, timeoutMs, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`Idle timeout (${timeoutMs}ms) exceeded for: ${label}`));
        }, timeoutMs);
    });
    try {
        const result = await Promise.race([promise, timeout]);
        clearTimeout(timer);
        return result;
    }
    catch (err) {
        clearTimeout(timer);
        throw err;
    }
}
//# sourceMappingURL=idle-timeout.js.map