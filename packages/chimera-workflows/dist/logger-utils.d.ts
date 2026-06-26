/**
 * Shared logger utilities for chimera-workflows.
 *
 * Provides a factory for lazy-initialized loggers with reset capability.
 * Used by all modules that defer logger creation so test mocks can intercept createLogger.
 */
import { createLogger } from '@chimera/paths';
export type LazyLogger = ReturnType<typeof createLogger>;
/**
 * Create a lazy-initialized logger with a reset function.
 *
 * @param namespace - The logger namespace (e.g. 'workflow.executor')
 * @returns An object with `getLog()` and `resetLog()` methods
 */
export declare function createLazyLogger(namespace: string): {
    getLog: () => LazyLogger;
    resetLog: () => void;
};
//# sourceMappingURL=logger-utils.d.ts.map