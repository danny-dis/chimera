import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { runCli } from '../src/cli.js';

class Capture extends Writable {
  constructor() {
    super();
    this.output = '';
  }
  _write(chunk, _encoding, callback) {
    this.output += chunk.toString();
    callback();
  }
}

test('runCli renders plan mode output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'chimera-cli-'));
  await writeFile(path.join(root, 'README.md'), '# Test');
  const stdout = new Capture();
  const stderr = new Capture();
  await runCli(['plan', 'add tests'], { cwd: root, stdout, stderr });
  assert.match(stdout.output, /# Plan mode/);
  assert.match(stdout.output, /Implementation plan for: add tests/);
  assert.match(stdout.output, /## Agent panel/);
});

test('runCli accepts explicit trio agent mode', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'chimera-cli-trio-'));
  await writeFile(path.join(root, 'README.md'), '# Test');
  const stdout = new Capture();
  const stderr = new Capture();
  await runCli(['plan', '--agents', 'trio', 'redesign auth rollback'], { cwd: root, stdout, stderr });
  assert.match(stdout.output, /Mode: trio/);
  assert.match(stdout.output, /challenger: abstain/);
});


test('runCli renders patch mode validation output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'chimera-cli-patch-'));
  await writeFile(path.join(root, 'file.txt'), 'one\n');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  await promisify(execFile)('git', ['init'], { cwd: root });
  const patch = 'diff --git a/file.txt b/file.txt\nindex 5626abf..f719efd 100644\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-one\n+two\n';
  await writeFile(path.join(root, 'change.diff'), patch);
  const stdout = new Capture();
  const stderr = new Capture();
  await runCli(['patch', 'change.diff'], { cwd: root, stdout, stderr });
  assert.match(stdout.output, /# Patch mode/);
  assert.match(stdout.output, /git apply --check: passed/);
});
