/**
 * Single source of truth for isolation error classification.
 *
 * Maps low-level git / fs errors into actionable user-facing messages
 * at the I/O boundary. Pattern: throw raw low-level error, classify at
 * the user-message surface, never silently swallow.
 *
 *   `known: true`  → recognized infrastructure/config failure. Produce
 *                    a user-facing "blocked" message; the message is
 *                    actionable (permission fix, disk free, etc.).
 *   `known: false` → still classifiable, but the underlying cause is a
 *                    user-input / registration bug that should crash
 *                    rather than be absorbed as a blocked state.
 *
 * Ported from research/archon/packages/isolation/src/errors.ts @ 2026-06-15.
 * Chimera-specific note: messages reference `.archon/config.yaml` for
 * backward compat with users who have existing Archon configs; chimera's
 * own config lives at `~/.chimera/config.yaml` — TODO when chimera ships
 * its own user-facing config surface.
 */
import type { IsolationBlockReason } from './types.js';
/**
 * Error thrown when isolation is required but cannot be provided.
 * Signals that ALL message handling should stop — not just workflows.
 * The user has already been notified of the specific reason before this
 * error is thrown.
 */
export declare class IsolationBlockedError extends Error {
    readonly reason: IsolationBlockReason;
    constructor(message: string, reason: IsolationBlockReason);
}
/**
 * Classify an isolation creation error into a user-friendly message.
 *
 * Searches both `err.message` and `err.stderr` (git subprocesses attach
 * stderr as a separate property). Case-insensitive substring match against
 * the pattern table. Falls back to a generic "could not create" message
 * with the original error text.
 */
export declare function classifyIsolationError(err: Error): string;
/**
 * Returns true if the error is a known infrastructure failure that should
 * produce a user-facing "blocked" message rather than a crash.
 *
 * Unknown errors (programming bugs, unexpected failures) should propagate
 * so they are visible as crashes rather than silent workspace failures.
 */
export declare function isKnownIsolationError(err: Error): boolean;
//# sourceMappingURL=errors.d.ts.map