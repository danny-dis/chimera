"use strict";
/**
 * Duration formatting utilities for workflow logging.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDuration = formatDuration;
exports.parseDbTimestamp = parseDbTimestamp;
/**
 * Format milliseconds as a human-readable duration string.
 */
function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60)
        return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60)
        return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
}
/**
 * Parse a database timestamp string to milliseconds since epoch.
 * Returns NaN if the timestamp is invalid.
 */
function parseDbTimestamp(timestamp) {
    const ms = Date.parse(timestamp);
    return Number.isNaN(ms) ? NaN : ms;
}
//# sourceMappingURL=duration.js.map