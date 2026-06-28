import { describe, it, expect, beforeAll } from 'vitest';
import { BiomeLinter } from '../biome-linter.js';
import { resolve } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const BIOME_CONFIG = resolve(import.meta.dirname, '../../../../../../biome.json');

describe('BiomeLinter', () => {
  let biomeAvailable = false;

  beforeAll(async () => {
    try {
      await execAsync('biome --version');
      biomeAvailable = true;
    } catch {
      biomeAvailable = false;
    }
  });
  it('lints valid TypeScript code', { timeout: 10000 }, async () => {
    const linter = new BiomeLinter({ configPath: BIOME_CONFIG });
    const result = await linter.lintCode('const x: number = 42;\nconsole.log(x);\n');
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('detects unused variables', { timeout: 10000 }, async () => {
    if (!biomeAvailable) return;
    const linter = new BiomeLinter({ configPath: BIOME_CONFIG });
    const result = await linter.lintCode('const unused = 42;\nconsole.log("hello");\n');
    console.log('RESULT:', JSON.stringify(result, null, 2));
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('detects unreachable code', { timeout: 10000 }, async () => {
    if (!biomeAvailable) return;
    const linter = new BiomeLinter({ configPath: BIOME_CONFIG });
    const code = `function test() {
  return 1;
  console.log("unreachable");
}
`;
    const result = await linter.lintCode(code);
    console.log('RESULT:', JSON.stringify(result, null, 2));
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns empty on empty input', { timeout: 10000 }, async () => {
    const linter = new BiomeLinter({ configPath: BIOME_CONFIG });
    const result = await linter.lintCode('');
    expect(result.passed).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('handles biome timeout gracefully', async () => {
    const linter = new BiomeLinter({ configPath: BIOME_CONFIG, timeoutMs: 1 });
    const result = await linter.lintCode('const x = 1;\n');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});