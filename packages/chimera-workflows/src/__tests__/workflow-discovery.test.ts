import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverWorkflows } from '../workflow-discovery.js';
it('discovers only visible YAML files in the fixed workflow directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chimera-discovery-'));
  const dir = join(root, 'examples/workflows');
  try {
    await mkdir(join(dir, 'nested'), { recursive: true });
    const definition = JSON.stringify({ name: 'valid', description: 'test workflow', nodes: [] });
    for (const name of ['a.yaml', 'b.yml', '.hidden.yaml', 'ignored.json', 'nested/ignored.yaml']) await writeFile(join(dir, name), definition);
    expect(Object.keys(await discoverWorkflows(root)).sort()).toEqual(['a', 'b']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('returns no workflows when the workflow directory does not exist', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chimera-empty-discovery-'));
  try { expect(await discoverWorkflows(root)).toEqual({}); }
  finally { await rm(root, { recursive: true, force: true }); }
});
