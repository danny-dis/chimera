import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanRepository } from '../src/repo.js';

const root = await mkdtemp(path.join(tmpdir(), 'chimera-repo-'));
await writeFile(path.join(root, 'package.json'), '{"scripts":{"test":"node --test"}}');
await writeFile(path.join(root, 'AGENTS.md'), '# instructions');
await mkdir(path.join(root, 'src'));
await writeFile(path.join(root, 'src', 'index.js'), 'export const value = 1;');
await writeFile(path.join(root, 'src', 'index.test.js'), 'import test from "node:test";');

test('scanRepository builds a deterministic repo profile', async () => {
  const repo = await scanRepository(root);
  assert.equal(repo.files.length, 4);
  assert.deepEqual(repo.instructions, ['AGENTS.md']);
  assert.deepEqual(repo.packageFiles, ['package.json']);
  assert.equal(repo.sourceFiles.length, 2);
  assert.equal(repo.tests.length, 1);
  assert.match(repo.summary, /Scanned 4 files/);
});
