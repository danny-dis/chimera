/**
 * Idle timeout utility for workflow node execution.
 */

/** Default idle timeout for workflow steps (5 minutes in ms). */
export const STEP_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Wrap a promise with an idle timeout.
 * If the promise doesn't resolve within timeoutMs, rejects with timeout error.
 */
export async function withIdleTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Idle timeout (${timeoutMs}ms) exceeded for: ${label}`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer!);
    return result;
  } catch (err) {
    clearTimeout(timer!);
    throw err;
  }
}
