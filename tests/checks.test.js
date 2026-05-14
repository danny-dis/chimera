import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverCheckCommands, runCheckCommands, summarizeCheckResults } from '../src/checks.js';
import { scanRepository } from '../src/repo.js';

const root = await mkdtemp(path.join(tmpdir(), 'chimera-checks-'));
await writeFile(path.join(root, 'package.json'), JSON.stringify({
  scripts: {
    lint: 'node --check ok.js',
    test: 'node ok.js',
  },
}, null, 2));
await writeFile(path.join(root, 'ok.js'), 'console.log("ok");\n');

test('discoverCheckCommands reads package scripts in preferred order', async () => {
  const repo = await scanRepository(root);
  const checks = await discoverCheckCommands(root, repo);
  assert.deepEqual(checks.map((check) => check.command), ['npm run lint', 'npm run test', 'git diff --check']);
});

test('runCheckCommands executes allowed checks and summarizes results', async () => {
  const results = await runCheckCommands({
    root,
    commands: [{ command: 'node ok.js', source: 'test' }],
    permissionProfile: 'read-only',
  });
  assert.equal(results[0].exitCode, 0);
  assert.deepEqual(summarizeCheckResults(results), ['node ok.js: passed']);
});
