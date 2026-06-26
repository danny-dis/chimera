/**
 * Tests for the `chimera skill …` subcommands.
 *
 * We exercise the command surface via `CliRouter.runCli()` so we cover the
 * real `commander` wiring (argument parsing, exit codes, help output) and
 * not just the inner helpers. Per-test workspaces keep each case
 * hermetic — `process.cwd()` is the CLI's notion of "workspace root".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { CliRouter } from '../cli-router.js';
import { _resetLegacyWarnings } from '@chimera/core';

let workspace: string;
let originalCwd: string;
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-skill-'));
  originalCwd = process.cwd();
  process.chdir(workspace);
  _resetLegacyWarnings();
  logSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(workspace, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function writeSkill(name: string, body: string, frontmatter?: Record<string, unknown>): Promise<string> {
  const dir = path.join(workspace, '.chimera', 'skills');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.md`);
  let content = '';
  if (frontmatter) {
    content += '---\n';
    for (const [k, v] of Object.entries(frontmatter)) {
      content += `${k}: ${JSON.stringify(v)}\n`;
    }
    content += '---\n';
  }
  content += body;
  await fs.writeFile(file, content, 'utf-8');
  return file;
}

describe('chimera skill list', () => {
  it('reports empty inventory with no skills installed', async () => {
    const router = new CliRouter();
    await router.runCli(['node', 'chimera', 'skill', 'list']);
    // Empty inventory message is logged through console.log
    const out = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => String(c[0]))
      .join('\n');
    expect(out).toContain('No skills installed');
  });

  it('lists installed skills with name/description/source/path columns', async () => {
    await writeSkill('alpha', '# Alpha\n\nBody text.', {
      name: 'alpha',
      description: 'First skill',
    });
    await writeSkill('beta', '# Beta\n', { name: 'beta', description: 'Second skill' });

    const router = new CliRouter();
    await router.runCli(['node', 'chimera', 'skill', 'list']);

    const out = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => String(c[0]))
      .join('\n');
    expect(out).toContain('name');
    expect(out).toContain('description');
    expect(out).toContain('source');
    expect(out).toContain('alpha');
    expect(out).toContain('beta');
    expect(out).toContain('First skill');
    expect(out).toContain('Second skill');
    expect(out).toContain('workspace');
  });
});

describe('chimera skill show', () => {
  it('prints the raw markdown content of a found skill', async () => {
    const file = await writeSkill('echo', '# Echo\n\nHello world.', {
      name: 'echo',
      description: 'Echoes back',
    });

    const router = new CliRouter();
    await router.runCli(['node', 'chimera', 'skill', 'show', 'echo']);

    // The CLI writes the file content to stdout. We spy on stdout.write
    // (NOT console.log) because the show command does process.stdout.write
    // directly to preserve the file's exact bytes.
    const written = (logSpy.mock.calls as unknown as string[][])
      .map((c) => c[0])
      .join('');
    expect(written).toContain('# Echo');
    expect(written).toContain('Hello world.');
    // The frontmatter block should also be present (we re-emit the raw file).
    expect(written).toContain('name:');
    // Sanity: the path of the file is the source.
    expect(written.length).toBeGreaterThan(0);
    expect(file).toBeDefined();
  });

  it('returns non-zero exit code and clear error when skill is not found', async () => {
    const router = new CliRouter();
    await router.runCli(['node', 'chimera', 'skill', 'show', 'nonexistent']);
    expect(process.exitCode).toBe(1);
    const errOut = (errSpy.mock.calls as unknown as string[][])
      .map((c) => String(c[0]))
      .join('\n');
    expect(errOut).toContain('nonexistent');
    expect(errOut).toContain('not found');
  });
});

describe('chimera skill validate', () => {
  it('reports OK for a valid skill with no inputs', async () => {
    const file = await writeSkill('valid', 'body', { name: 'valid', description: 'ok' });
    const router = new CliRouter();
    await router.runCli(['node', 'chimera', 'skill', 'validate', file]);

    const out = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => String(c[0]))
      .join('\n');
    expect(out).toContain('OK');
    expect(out).toContain('no inputs declared');
  });

  it('reports OK for a valid skill with a typed inputs block', async () => {
    const dir = path.join(workspace, '.chimera', 'skills');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, 'typed.md');
    await fs.writeFile(
      file,
      [
        '---',
        'name: typed',
        'description: typed skill',
        'inputs:',
        '  topic: string',
        '  depth: number?',
        '---',
        '# body',
      ].join('\n'),
      'utf-8',
    );

    const router = new CliRouter();
    await router.runCli(['node', 'chimera', 'skill', 'validate', file]);

    const out = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => String(c[0]))
      .join('\n');
    expect(out).toContain('OK');
  });

  it('reports errors for a skill with an unknown input type', async () => {
    const dir = path.join(workspace, '.chimera', 'skills');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, 'bad.md');
    await fs.writeFile(
      file,
      ['---', 'name: bad', 'description: x', 'inputs:', '  count: integer', '---', '# body'].join('\n'),
      'utf-8',
    );

    const router = new CliRouter();
    await router.runCli(['node', 'chimera', 'skill', 'validate', file]);

    expect(process.exitCode).toBe(1);
    const errOut = (errSpy.mock.calls as unknown as string[][])
      .map((c) => String(c[0]))
      .join('\n');
    expect(errOut).toContain('integer');
  });

  it('reports an error when the file does not exist', async () => {
    const router = new CliRouter();
    await router.runCli(['node', 'chimera', 'skill', 'validate', path.join(workspace, 'missing.md')]);
    expect(process.exitCode).toBe(1);
    const errOut = (errSpy.mock.calls as unknown as string[][])
      .map((c) => String(c[0]))
      .join('\n');
    expect(errOut).toContain('Cannot read file');
  });
});
