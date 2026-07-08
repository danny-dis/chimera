"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLazyLogger = createLazyLogger;
/**
 * Shared logger utilities for chimera-workflows.
 *
 * Provides a factory for lazy-initialized loggers with reset capability.
 * Used by all modules that defer logger creation so test mocks can intercept createLogger.
 */
const paths_1 = require("@chimera/paths");
/**
 * Create a lazy-initialized logger with a reset function.
 *
 * @param namespace - The logger namespace (e.g. 'workflow.executor')
 * @returns An object with `getLog()` and `resetLog()` methods
 */
function createLazyLogger(namespace) {
    let cachedLog;
    function getLog() {
        if (!cachedLog)
            cachedLog = (0, paths_1.createLogger)(namespace);
        return cachedLog;
    }
    function resetLog() {
        cachedLog = undefined;
    }
    return { getLog, resetLog };
}
//# sourceMappingURL=logger-utils.js.map