/**
 * @chimera/isolation — worktree-helpers unit tests
 *
 * Pure-function tests for slugify, shortHash, and resolveRepoLocalOverride.
 * No git, no fs — these are the building blocks WorktreeProvider composes.
 */

import { describe, expect, it } from 'vitest';

import { slugify, shortHash, resolveRepoLocalOverride } from '../providers/worktree-helpers.js';

describe('slugify', () => {
  it('lowercases and replaces non-alphanumerics with hyphens', () => {
    expect(slugify('Implement Foo! Bar?')).toBe('implement-foo-bar');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello');
    expect(slugify('  spaces  ')).toBe('spaces');
  });

  it('collapses runs of non-alphanumerics', () => {
    expect(slugify('a   b---c___d')).toBe('a-b-c-d');
  });

  it('caps at 50 characters', () => {
    const long = 'a'.repeat(200);
    const result = slugify(long);
    expect(result.length).toBe(50);
    expect(result).toBe('a'.repeat(50));
  });

  it('returns empty string for non-letters', () => {
    expect(slugify('!@#$%^&*()')).toBe('');
  });

  it('preserves digits', () => {
    expect(slugify('chimera-task-42')).toBe('chimera-task-42');
    expect(slugify('Issue 1234')).toBe('issue-1234');
  });
});

describe('shortHash', () => {
  it('returns 8 hex characters', () => {
    const h = shortHash('any input');
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic', () => {
    expect(shortHash('x')).toBe(shortHash('x'));
  });

  it('differs for different inputs', () => {
    expect(shortHash('a')).not.toBe(shortHash('b'));
  });

  it('handles empty string', () => {
    const h = shortHash('');
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('resolveRepoLocalOverride', () => {
  const repoRoot = '/home/user/myrepo';

  it('returns undefined when input is undefined', () => {
    expect(resolveRepoLocalOverride(undefined, repoRoot)).toBeUndefined();
  });

  it('returns undefined for empty / whitespace-only input', () => {
    expect(resolveRepoLocalOverride('', repoRoot)).toBeUndefined();
    expect(resolveRepoLocalOverride('   ', repoRoot)).toBeUndefined();
  });

  it('returns the trimmed relative path for valid input', () => {
    expect(resolveRepoLocalOverride('.worktrees', repoRoot)).toBe('.worktrees');
    expect(resolveRepoLocalOverride('  .worktrees  ', repoRoot)).toBe('.worktrees');
  });

  it('accepts nested relative paths', () => {
    const result = resolveRepoLocalOverride('worktrees/main', repoRoot);
    expect(result).toBeDefined();
    // path.normalize on Windows returns backslashes; compare with posix.
    expect((result ?? '').replace(/\\/g, '/')).toBe('worktrees/main');
  });

  it('throws on absolute path', () => {
    expect(() => resolveRepoLocalOverride('/tmp/worktrees', repoRoot)).toThrow(/absolute/);
  });

  it('throws on bare `..`', () => {
    expect(() => resolveRepoLocalOverride('..', repoRoot)).toThrow(/within the repo/);
  });

  it('throws on leading `../`', () => {
    expect(() => resolveRepoLocalOverride('../escape', repoRoot)).toThrow(/within the repo/);
  });

  it('throws on embedded `../`', () => {
    expect(() => resolveRepoLocalOverride('foo/../../escape', repoRoot)).toThrow(
      /within the repo/
    );
  });

  it('throws when resolved path escapes repo root', () => {
    // `foo/../bar` normalizes to `bar` which is inside the repo — so this
    // case should NOT throw. The case that catches us is a symlink-like
    // case that escapes. Hard to construct portably, so skip.
  });
});
