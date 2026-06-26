/**
 * Tests for the `chimera workflow …` subcommands.
 *
 * Mirror the structure of `skill-command.test.ts` — exercise the real
 * `commander` wiring through `CliRouter.runCli()` rather than poking at
 * inner helpers. Per-test workspaces keep the on-disk `WorkflowAutoLoader`
 * calls hermetic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { CliRouter } from '../cli-router.js';

let workspace: string;
let originalCwd: string;
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-workflow-'));
  originalCwd = process.cwd();
  process.chdir(workspace);
  logSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(workspace, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function writeWorkflow(name: string, yaml: string): Promise<string> {
  const dir = path.join(workspace, '.chimera', 'workflows');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.yaml`);
  await fs.writeFile(file, yaml, 'utf-8');
  return file;
}

describe('chimera workflow list', () => {
  it('includes the built-in workflows even with no user-defined ones', async () => {
    const router = new CliRouter();
    await router.runCli(['node', 'chimera', 'workflow', 'list']);

    const out = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => String(c[0]))
      .join('\n');
    // The orchestrator + mesh + coordinator each register a built-in.
    expect(out).toContain('standard-draft');
    expect(out).toContain('quality-gate');
    expect(out).toContain('parallel-decompose');
  });

  it('includes user-defined workflows from .chimera/workflows/', async () => {
    await writeWorkflow(
      'review',
      'name: review\ndescription: PR review\nsteps:\n  - { id: s1, kind: llm, config: {} }\n',
    );

    const router = new CliRouter();
    await router.runCli(['node', 'chimera', 'workflow', 'list']);

    const out = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => String(c[0]))
      .join('\n');
    expect(out).toContain('review');
    expect(out).toContain('workspace');
  });
});

describe('chimera workflow show', () => {
  it('prints the raw on-disk file when the workflow is user-defined', async () => {
    const file = await writeWorkflow(
      'ship',
      'name: ship\ndescription: ship it\nsteps:\n  - { id: s1, kind: tool, config: { name: build } }\n',
    );

    const router = new CliRouter();
    await router.runCli(['node', 'chimera', 'workflow', 'show', 'ship']);

    // The CLI dumps the raw file via process.stdout.write (preserving
    // bytes), so we spy on stdout.write to assert content.
    const written = (logSpy.mock.calls as unknown as string[][])
      .map((c) => c[0])
      .join('');
    expect(written).toContain('name: ship');
    expect(written).toContain('description: ship it');
  });

  it('prints JSON for a built-in workflow (no on-disk path)', async () => {
    const router = new CliRouter();
    await router.runCli(['node', 'chimera', 'workflow', 'show', 'standard-draft']);

    const written = (logSpy.mock.calls as unknown as string[][])
      .map((c) => c[0])
      .join('');
    // Built-ins don't have a path; the CLI falls back to JSON.stringify.
    expect(written).toContain('"name": "standard-draft"');
    expect(written).toContain('"steps"');
  });

  it('returns non-zero exit code when the workflow is not found', async () => {
    const router = new CliRouter();
    await router.runCli(['node', 'chimera', 'workflow', 'show', 'nonexistent']);
    expect(process.exitCode).toBe(1);
    const errOut = (errSpy.mock.calls as unknown as string[][])
      .map((c) => String(c[0]))
      .join('\n');
    expect(errOut).toContain('nonexistent');
  });
});

describe('chimera workflow run', () => {
  it('exits cleanly when the workflow is not found', async () => {
    const router = new CliRouter();
    await router.runCli(['node', 'chimera', 'workflow', 'run', 'nope', '--input', '{}']);
    expect(process.exitCode).toBe(1);
  });

  it('rejects malformed --input JSON with a clear error', async () => {
    // Use a built-in so we don't depend on disk. The run will fail at
    // the runtime layer (no providers) — we just want the JSON parse
    // guard to fire first.
    const router = new CliRouter();
    await router.runCli(['node', 'chimera', 'workflow', 'run', 'standard-draft', '--input', 'not-json']);
    expect(process.exitCode).toBe(1);
    const errOut = (errSpy.mock.calls as unknown as string[][])
      .map((c) => String(c[0]))
      .join('\n');
    expect(errOut).toContain('--input is not valid JSON');
  });
});
