/**
 * @chimera/isolation — error classifier unit tests
 *
 * Verifies the full pattern table from errors.ts plus the default-fallback
 * path. Pattern table is the single source of truth for user-facing
 * isolation error messages; if you change a message, change the test.
 */

import { describe, expect, it } from 'vitest';

import {
  classifyIsolationError,
  isKnownIsolationError,
  IsolationBlockedError,
} from '../errors.js';

describe('classifyIsolationError', () => {
  it('classifies permission denied (message)', () => {
    const err = new Error('permission denied: cannot open .git/config');
    const msg = classifyIsolationError(err);
    expect(msg).toMatch(/Permission denied/);
    expect(msg).toMatch(/file system permissions/);
  });

  it('classifies permission denied via stderr (EACCES)', () => {
    const err = Object.assign(new Error('git worktree add failed'), {
      stderr: 'error: EACCES: permission denied, open .git/worktrees/agent-x',
    });
    const msg = classifyIsolationError(err);
    expect(msg).toMatch(/Permission denied/);
  });

  it('classifies timeout', () => {
    const err = new Error('git fetch origin: timeout after 300000ms');
    const msg = classifyIsolationError(err);
    expect(msg).toMatch(/Timed out/);
    expect(msg).toMatch(/slow or unavailable/);
  });

  it('classifies disk full (lowercase "no space left")', () => {
    const err = new Error('write failed: no space left on device');
    const msg = classifyIsolationError(err);
    expect(msg).toMatch(/No disk space/);
  });

  it('classifies disk full (uppercase ENOSPC)', () => {
    const err = new Error('ENOSPC: no space left on device');
    const msg = classifyIsolationError(err);
    expect(msg).toMatch(/No disk space/);
  });

  it('classifies not-a-git-repository', () => {
    const err = new Error('fatal: not a git repository (or any of the parent directories): .git');
    const msg = classifyIsolationError(err);
    expect(msg).toMatch(/not a valid git repository/);
  });

  it('classifies branch not found', () => {
    // The classifier greps the lowercased message for the substring
    // "branch not found". Use a message that contains that exact
    // substring (not "branch 'X' not found" — the apostrophe would
    // break the substring match).
    const err = new Error('fatal: branch not found in upstream origin');
    const msg = classifyIsolationError(err);
    expect(msg).toMatch(/Branch not found/);
  });

  it('classifies no base branch configured', () => {
    const err = new Error('no base branch configured for this codebase');
    const msg = classifyIsolationError(err);
    expect(msg).toMatch(/No base branch configured/);
  });

  it('classifies cross-clone conflict', () => {
    const err = new Error('worktree at /foo/bar belongs to a different clone');
    const msg = classifyIsolationError(err);
    expect(msg).toMatch(/different local clone/);
  });

  it('classifies ownership verification failure', () => {
    const err = new Error('cannot verify worktree ownership: not a git directory');
    const msg = classifyIsolationError(err);
    expect(msg).toMatch(/Cannot verify ownership/);
  });

  it('classifies adoption refusal', () => {
    const err = new Error('cannot adopt non-empty directory at worktree path');
    const msg = classifyIsolationError(err);
    expect(msg).toMatch(/Refused to adopt/);
  });

  it('classifies submodule init failure', () => {
    const err = new Error('submodule initialization failed: missing remote');
    const msg = classifyIsolationError(err);
    expect(msg).toMatch(/Submodule initialization failed/);
  });

  it('falls back to generic message for unknown error', () => {
    const err = new Error('something we did not anticipate');
    const msg = classifyIsolationError(err);
    expect(msg).toMatch(/Could not create isolated workspace/);
    expect(msg).toContain('something we did not anticipate');
  });

  it('is case-insensitive', () => {
    const err = new Error('PERMISSION DENIED opening file');
    const msg = classifyIsolationError(err);
    expect(msg).toMatch(/Permission denied/);
  });
});

describe('isKnownIsolationError', () => {
  it('returns true for known infrastructure failures', () => {
    expect(isKnownIsolationError(new Error('permission denied'))).toBe(true);
    expect(isKnownIsolationError(new Error('no space left on device'))).toBe(true);
    expect(isKnownIsolationError(new Error('not a git repository'))).toBe(true);
  });

  it('returns false for non-known patterns (user-input bugs)', () => {
    expect(isKnownIsolationError(new Error('cannot extract owner/repo from /short/path'))).toBe(
      false
    );
  });

  it('returns false for unrecognized errors', () => {
    expect(isKnownIsolationError(new Error('something else entirely'))).toBe(false);
  });

  it('checks stderr as well as message', () => {
    const err = Object.assign(new Error('worktree add failed'), {
      stderr: 'fatal: not a git repository',
    });
    expect(isKnownIsolationError(err)).toBe(true);
  });
});

describe('IsolationBlockedError', () => {
  it('preserves reason on the instance', () => {
    const err = new IsolationBlockedError('no worktree available', 'creation_failed');
    expect(err.name).toBe('IsolationBlockedError');
    expect(err.reason).toBe('creation_failed');
    expect(err.message).toBe('no worktree available');
  });

  it('is catchable as Error', () => {
    const err = new IsolationBlockedError('blocked', 'creation_failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(IsolationBlockedError);
  });
});
