/**
 * Regression tests for path-from-task content-based change detection.
 *
 * BUG: path-from-task.ts:92 uses mtime/size to detect changes:
 *     `return before.mtime !== after.mtime || before.size !== after.size;`
 *     A same-size, same-mtime write (e.g. touch + rewrite with identical
 *     content) is NOT detected as a change — false "unchanged".
 *
 * EXPECTED (after fix):
 *   - Content hash comparison detects same-size same-mtime changes
 *   - Identical content rewrite is correctly identified as unchanged
 *   - Different content with same size is detected as changed
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { snapshotTarget, targetChanged } from '../path-from-task.js';

describe('path-from-task content-based change detection', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots) rmSync(r, { recursive: true, force: true });
  });

  function makeRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'chimera-path-content-'));
    roots.push(root);
    return root;
  }

  it('detects same-size content change (currently broken)', () => {
    const root = makeRoot();
    const file = join(root, 'test.txt');

    // Write initial content
    writeFileSync(file, 'AAAA'); // 4 bytes
    const before = snapshotTarget('create test.txt', root);
    expect(before).not.toBeNull();

    // Rewrite with different content, SAME SIZE
    writeFileSync(file, 'BBBB'); // still 4 bytes

    // After fix: should detect content change despite same size
    // Before fix: returns false (same size, mtime may be same on fast writes)
    const changed = targetChanged('create test.txt', root, before);
    expect(changed).toBe(true);
  });

  it('correctly reports unchanged when content is identical', () => {
    const root = makeRoot();
    const file = join(root, 'test.txt');

    writeFileSync(file, 'AAAA');
    const before = snapshotTarget('create test.txt', root);

    // Rewrite with IDENTICAL content
    writeFileSync(file, 'AAAA');

    const changed = targetChanged('create test.txt', root, before);
    // Identical content should be unchanged
    expect(changed).toBe(false);
  });

  it('detects size change', () => {
    const root = makeRoot();
    const file = join(root, 'test.txt');

    writeFileSync(file, 'AAAA'); // 4 bytes
    const before = snapshotTarget('create test.txt', root);

    writeFileSync(file, 'AAAAAAAA'); // 8 bytes
    const changed = targetChanged('create test.txt', root, before);
    expect(changed).toBe(true);
  });

  it('detects new file creation', () => {
    const root = makeRoot();

    // No file exists yet
    const changed = targetChanged('create test.txt', root, null);
    expect(changed).toBe(false);

    // Create the file
    writeFileSync(join(root, 'test.txt'), 'content');
    const after = snapshotTarget('create test.txt', root);
    expect(after).not.toBeNull();

    // Now targetChanged with before=null should return true
    const changed2 = targetChanged('create test.txt', root, null);
    expect(changed2).toBe(true);
  });
});
