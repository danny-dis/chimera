/**
 * Duration formatting utilities for workflow logging.
 */

/**
 * Format milliseconds as a human-readable duration string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Parse a database timestamp string to milliseconds since epoch.
 * Returns NaN if the timestamp is invalid.
 */
export function parseDbTimestamp(timestamp: string): number {
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? NaN : ms;
}
