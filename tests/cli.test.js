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
});
