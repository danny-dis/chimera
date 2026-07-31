import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { expectedPathFromTask, fileLandedOnDisk, snapshotTarget, targetChanged, taskWantsFiles } from '../path-from-task.js';

describe('expectedPathFromTask', () => {
  it('preserves a leading dot-directory segment (regression: .foo/bar.txt)', () => {
    expect(expectedPathFromTask('create .foo/bar.txt')).toBe('.foo/bar.txt');
  });

  it('preserves a leading ./ prefix', () => {
    expect(expectedPathFromTask('Write to ./baz.txt')).toBe('./baz.txt');
  });

  it('preserves a nested dot-config path', () => {
    expect(expectedPathFromTask('generate .config/app.json')).toBe('.config/app.json');
  });

  it('keeps extracting plain relative paths without a leading dot', () => {
    expect(expectedPathFromTask('fix the bug in src/main.ts')).toBe('src/main.ts');
    expect(expectedPathFromTask('create greeter.js')).toBe('greeter.js');
  });

  it('still prefers the verb-attached path over an unrelated mention', () => {
    expect(expectedPathFromTask('Read config.yaml then write report.md')).toBe('report.md');
  });

  it('returns undefined when no file is named', () => {
    expect(expectedPathFromTask('Summarize the architecture')).toBeUndefined();
  });

  it('does not match a partial extension (trailing word boundary preserved)', () => {
    expect(expectedPathFromTask('run model.pyc')).toBeUndefined();
  });
});

describe('taskWantsFiles', () => {
  it('classifies a dot-directory write task as a file task', () => {
    expect(taskWantsFiles('write .config/app.json')).toBe(true);
    expect(taskWantsFiles('implement src/app.ts')).toBe(true);
  });
});

describe('file-landed gate on dot paths', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots) rmSync(r, { recursive: true, force: true });
  });

  function makeRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'chimera-pathdot-'));
    roots.push(root);
    return root;
  }

  it('reports the file as landed when the .foo/bar.txt path is on disk', () => {
    const root = makeRoot();
    mkdirSync(join(root, '.foo'));
    writeFileSync(join(root, '.foo', 'bar.txt'), 'content');
    expect(fileLandedOnDisk('create .foo/bar.txt', root)).toBe(true);
  });

  it('does NOT report landed when only the dot-less foo/bar.txt exists', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'foo'));
    writeFileSync(join(root, 'foo', 'bar.txt'), 'content');
    expect(fileLandedOnDisk('create .foo/bar.txt', root)).toBe(false);
  });

  it('normalizes a leading ./ prefix to the same on-disk file', () => {
    const root = makeRoot();
    writeFileSync(join(root, 'baz.txt'), 'content');
    expect(fileLandedOnDisk('Write to ./baz.txt', root)).toBe(true);
  });

  it('snapshotTarget and targetChanged honor the leading dot', () => {
    const root = makeRoot();
    expect(snapshotTarget('create .foo/bar.txt', root)).toBeNull();
    mkdirSync(join(root, '.foo'));
    writeFileSync(join(root, '.foo', 'bar.txt'), 'v1');
    const before = snapshotTarget('create .foo/bar.txt', root);
    expect(before).not.toBeNull();
    expect(targetChanged('create .foo/bar.txt', root, null)).toBe(true);
    expect(targetChanged('create .foo/bar.txt', root, before)).toBe(false);
    writeFileSync(join(root, '.foo', 'bar.txt'), 'v2-longer');
    expect(targetChanged('create .foo/bar.txt', root, before)).toBe(true);
  });
});
