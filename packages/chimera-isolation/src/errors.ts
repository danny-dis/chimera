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

// ---------------------------------------------------------------------------
// IsolationBlockedError
// ---------------------------------------------------------------------------

/**
 * Error thrown when isolation is required but cannot be provided.
 * Signals that ALL message handling should stop — not just workflows.
 * The user has already been notified of the specific reason before this
 * error is thrown.
 */
export class IsolationBlockedError extends Error {
  readonly reason: IsolationBlockReason;

  constructor(message: string, reason: IsolationBlockReason) {
    super(message);
    this.name = 'IsolationBlockedError';
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Classification table
// ---------------------------------------------------------------------------

interface ErrorPattern {
  pattern: string;
  message: string;
  known: boolean;
}

const ERROR_PATTERNS: readonly ErrorPattern[] = [
  {
    pattern: 'permission denied',
    message:
      '**Error:** Permission denied while creating workspace. Check file system permissions.',
    known: true,
  },
  {
    pattern: 'eacces',
    message:
      '**Error:** Permission denied while creating workspace. Check file system permissions.',
    known: true,
  },
  {
    pattern: 'timeout',
    message: '**Error:** Timed out creating workspace. Git repository may be slow or unavailable.',
    known: true,
  },
  {
    pattern: 'no space left',
    message: '**Error:** No disk space available for new workspace.',
    known: true,
  },
  {
    pattern: 'enospc',
    message: '**Error:** No disk space available for new workspace.',
    known: true,
  },
  {
    pattern: 'not a git repository',
    message: '**Error:** Target path is not a valid git repository.',
    known: true,
  },
  {
    // Deliberately not `known` — this is a user-input / registration bug,
    // not an infrastructure failure. Surface classification, but crash.
    pattern: 'cannot extract owner/repo',
    message:
      '**Error:** Repository path is too short to extract owner and repo name. ' +
      'Re-register the codebase with a full path (e.g. `/home/user/owner/repo`).',
    known: false,
  },
  {
    pattern: 'branch not found',
    message:
      '**Error:** Branch not found. The requested branch may have been deleted or not yet pushed.',
    known: true,
  },
  {
    pattern: 'no base branch configured',
    message:
      '**Error:** No base branch configured. Set `worktree.baseBranch` in `.archon/config.yaml` ' +
      'or use the `--from` flag to select a branch (e.g., `--from dev`).',
    known: true,
  },
  {
    pattern: 'belongs to a different clone',
    message:
      '**Error:** A worktree at the target path was created by a different local clone. ' +
      'Remove it from that clone, or register this codebase from the same local path.',
    known: true,
  },
  {
    pattern: 'cannot verify worktree ownership',
    message:
      '**Error:** Cannot verify ownership of an existing worktree at the target path. ' +
      'Check file system permissions and remove any unrelated git directories at that path.',
    known: true,
  },
  {
    pattern: 'cannot adopt',
    message:
      '**Error:** Refused to adopt an existing directory at the worktree path. ' +
      'Remove it or choose a different branch/codebase registration.',
    known: true,
  },
  {
    pattern: 'submodule initialization failed',
    message:
      '**Error:** Submodule initialization failed. Check credentials and network access to ' +
      'submodule remotes, or set `worktree.initSubmodules: false` in `.archon/config.yaml` ' +
      'to opt out if submodules are not needed for your workflows.',
    known: true,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify an isolation creation error into a user-friendly message.
 *
 * Searches both `err.message` and `err.stderr` (git subprocesses attach
 * stderr as a separate property). Case-insensitive substring match against
 * the pattern table. Falls back to a generic "could not create" message
 * with the original error text.
 */
export function classifyIsolationError(err: Error): string {
  const stderr = (err as Error & { stderr?: string }).stderr ?? '';
  const errorLower = `${err.message} ${stderr}`.toLowerCase();

  for (const { pattern, message } of ERROR_PATTERNS) {
    if (errorLower.includes(pattern)) {
      return message;
    }
  }

  return `**Error:** Could not create isolated workspace (${err.message}).`;
}

/**
 * Returns true if the error is a known infrastructure failure that should
 * produce a user-facing "blocked" message rather than a crash.
 *
 * Unknown errors (programming bugs, unexpected failures) should propagate
 * so they are visible as crashes rather than silent workspace failures.
 */
export function isKnownIsolationError(err: Error): boolean {
  const stderr = (err as Error & { stderr?: string }).stderr ?? '';
  const errorLower = `${err.message} ${stderr}`.toLowerCase();

  return ERROR_PATTERNS.some(({ pattern, known }) => known && errorLower.includes(pattern));
}
