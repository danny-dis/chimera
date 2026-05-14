import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { applyPatch, checkPatch, extractPatchFiles, loadPatch, validatePatchPaths } from '../src/patch.js';

const execFileAsync = promisify(execFile);

const root = await mkdtemp(path.join(tmpdir(), 'chimera-patch-'));
await execFileAsync('git', ['init'], { cwd: root });
await writeFile(path.join(root, 'hello.txt'), 'hello\n');
const patchText = `diff --git a/hello.txt b/hello.txt\nindex ce01362..cc628cc 100644\n--- a/hello.txt\n+++ b/hello.txt\n@@ -1 +1 @@\n-hello\n+hello chimera\n`;
await writeFile(path.join(root, 'change.diff'), patchText);

test('extractPatchFiles and validatePatchPaths inspect unified diffs', () => {
  assert.deepEqual(extractPatchFiles(patchText), ['hello.txt']);
  assert.equal(validatePatchPaths(['hello.txt']).valid, true);
  assert.equal(validatePatchPaths(['../secret']).valid, false);
});

test('loadPatch reads patch artifacts relative to the workspace', async () => {
  const loaded = await loadPatch(root, 'change.diff');
  assert.deepEqual(loaded.files, ['hello.txt']);
});

test('checkPatch validates a patch without applying it', async () => {
  const result = await checkPatch(root, patchText);
  assert.equal(result.ok, true);
  assert.equal(await readFile(path.join(root, 'hello.txt'), 'utf8'), 'hello\n');
});

test('applyPatch blocks read-only profile and applies with workspace-write', async () => {
  const blocked = await applyPatch(root, patchText, 'read-only');
  assert.equal(blocked.applied, false);
  assert.equal(blocked.skipped, true);
  const applied = await applyPatch(root, patchText, 'workspace-write');
  assert.equal(applied.applied, true);
  assert.equal(await readFile(path.join(root, 'hello.txt'), 'utf8'), 'hello chimera\n');
});
