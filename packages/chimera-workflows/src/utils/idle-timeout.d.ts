/**
 * Idle timeout utility for workflow node execution.
 */
/** Default idle timeout for workflow steps (5 minutes in ms). */
export declare const STEP_IDLE_TIMEOUT_MS: number;
/**
 * Wrap a promise with an idle timeout.
 * If the promise doesn't resolve within timeoutMs, rejects with timeout error.
 */
export declare function withIdleTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
//# sourceMappingURL=idle-timeout.d.ts.map