import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { initAgentsMd } from '../commands/init.js';

describe('initAgentsMd', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-init-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('detects npm test + vitest from package.json + vitest.config.ts and writes AGENTS.md', async () => {
    const pkg = {
      name: 'demo',
      version: '0.0.0',
      scripts: {
        build: 'tsc',
        test: 'vitest run',
        lint: 'eslint .',
      },
      devDependencies: {
        vitest: '^1.0.0',
        typescript: '^5.0.0',
      },
    };
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkg), 'utf-8');
    await fs.writeFile(
      path.join(tmpDir, 'vitest.config.ts'),
      "import { defineConfig } from 'vitest/config';\nexport default defineConfig({});\n",
      'utf-8',
    );
    // Create a few real files so the file map is non-trivial.
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'index.ts'), 'export {};\n', 'utf-8');

    const result = await initAgentsMd(tmpDir);
    expect(result.path).toBe(path.join(tmpDir, 'AGENTS.md'));
    expect(result.bytesWritten).toBeGreaterThan(0);

    const written = await fs.readFile(result.path, 'utf-8');
    expect(written).toContain('npm test');
    expect(written).toContain('vitest');
    expect(written).toContain('# Build');
    expect(written).toContain('# Test');
    expect(written).toContain('# Lint');
    expect(written).toContain('# File Map');
  });

  it('does not overwrite an existing AGENTS.md unless force: true', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{}', 'utf-8');
    const target = path.join(tmpDir, 'AGENTS.md');
    await fs.writeFile(target, 'DO NOT TOUCH', 'utf-8');

    const noForce = await initAgentsMd(tmpDir);
    expect(noForce.bytesWritten).toBe(0);
    const unchanged = await fs.readFile(target, 'utf-8');
    expect(unchanged).toBe('DO NOT TOUCH');

    const withForce = await initAgentsMd(tmpDir, { force: true });
    expect(withForce.bytesWritten).toBeGreaterThan(0);
    const replaced = await fs.readFile(target, 'utf-8');
    expect(replaced).not.toBe('DO NOT TOUCH');
    expect(replaced).toContain('# Project');
  });
});
