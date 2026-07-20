import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { findMissingCitedPaths } from '../agent-tool-loop.js';

describe('findMissingCitedPaths', () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-path-test-'));
  // Create a few REAL files/dirs so the validator has ground truth.
  mkdirSync(join(root, 'src', 'core'), { recursive: true });
  writeFileSync(join(root, 'src', 'index.js'), '');
  writeFileSync(join(root, 'src', 'core', 'filoApp.js'), '');
  mkdirSync(join(root, 'src', 'utils'), { recursive: true });
  writeFileSync(join(root, 'src', 'utils', 'testUtils.js'), '');

  it('flags invented file paths from dependency names', () => {
    const report = 'Entry points: `src/ipfs.js`, src/stream.js, src/peer.js.';
    const missing = findMissingCitedPaths(report, root);
    expect(missing.sort()).toEqual(['src/ipfs.js', 'src/peer.js', 'src/stream.js']);
  });

  it('flags invented directory-style citations (shifted hallucination)', () => {
    const report = 'Uses src/client/, src/server/, src/database/.';
    const missing = findMissingCitedPaths(report, root);
    expect(missing.sort()).toEqual(['src/client', 'src/database', 'src/server']);
  });

  it('keeps real paths (files and dirs that exist)', () => {
    const report = 'Real: src/index.js, src/core/filoApp.js, src/utils/testUtils.js.';
    const missing = findMissingCitedPaths(report, root);
    expect(missing).toEqual([]);
  });

  it('handles mixed real + hallucinated in one report', () => {
    const report =
      'Real src/index.js and src/core/filoApp.js, but invented src/ipfs.js and src/client/.';
    const missing = findMissingCitedPaths(report, root);
    expect(missing.sort()).toEqual(['src/client', 'src/ipfs.js']);
  });

  it('dedupes repeated citations and trims trailing punctuation', () => {
    const report = 'src/ipfs.js, src/ipfs.js. src/client/;';
    const missing = findMissingCitedPaths(report, root);
    expect(missing.sort()).toEqual(['src/client', 'src/ipfs.js']);
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));
});
