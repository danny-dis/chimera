import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliRouter } from '../cli-router.js';

vi.mock('../config-loader.js', async original => ({
  ...await original<typeof import('../config-loader.js')>(), configExists: () => true,
}));

const originalCwd = process.cwd();
let workspace: string;
afterEach(async () => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  if (workspace) await rm(workspace, { recursive: true, force: true });
});

it.each([false, true])('no-learn startup leaves style files unchanged (explicit style: %s)', async explicit => {
  workspace = await mkdtemp(join(tmpdir(), 'chimera-no-learn-style-'));
  const dir = join(workspace, '.chimera', 'output-styles');
  const custom = '---\nname: concise\ndescription: user style\n---\nKeep answers short.\n';
  if (explicit) {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'concise.md'), custom);
  }
  process.chdir(workspace);
  const router = new CliRouter() as any;
  router.program.parseOptions(['--no-learn']);
  const stop = new Error('stop before provider initialization');
  vi.spyOn(router, 'getRoleMappedProviders').mockRejectedValue(stop);
  await expect(router.run('code', 'repair sum.js')).rejects.toBe(stop);
  expect(await readdir(dir).catch(() => [])).toEqual(explicit ? ['concise.md'] : []);
  if (explicit) expect(await readFile(join(dir, 'concise.md'), 'utf8')).toBe(custom);
});
