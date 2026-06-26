import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { skillLoadTool } from '../tools/skill.js';
import type { ToolContext } from '../tool-schema.js';
import { EventStream, CostTracker } from '@chimera/core';

let workspace: string;

function makeContext(workspaceRoot: string): ToolContext {
  return {
    workspaceRoot,
    sessionId: 'test',
    eventStream: new EventStream(),
    costTracker: {
      setBudget: () => {},
      recordSpend: () => {},
      getSpend: () => 0,
      getRemaining: () => Infinity,
    } as unknown as CostTracker,
    permissionCheck: () => 'allow',
  };
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-tool-'));
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('skillLoadTool — path resolution', () => {
  it('loads a skill from <workspace>/.chimera/skills/', async () => {
    const dir = path.join(workspace, '.chimera', 'skills');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'hello.md'), '# Hello\n', 'utf-8');

    const result = await skillLoadTool.execute({ skillName: 'hello' }, makeContext(workspace));
    expect(result.skillName).toBe('hello');
    expect(result.content).toContain('Hello');
  });

  it('falls back to legacy .kilo/skills/ when .chimera/ is absent', async () => {
    const dir = path.join(workspace, '.kilo', 'skills');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'legacy.md'), '# Legacy\n', 'utf-8');

    const result = await skillLoadTool.execute({ skillName: 'legacy' }, makeContext(workspace));
    expect(result.skillName).toBe('legacy');
    expect(result.content).toContain('Legacy');
  });

  it('prefers .chimera/skills/ over .kilo/skills/', async () => {
    const newDir = path.join(workspace, '.chimera', 'skills');
    const oldDir = path.join(workspace, '.kilo', 'skills');
    await fs.mkdir(newDir, { recursive: true });
    await fs.mkdir(oldDir, { recursive: true });
    await fs.writeFile(path.join(newDir, 'dup.md'), '# NewPath\n', 'utf-8');
    await fs.writeFile(path.join(oldDir, 'dup.md'), '# OldPath\n', 'utf-8');

    const result = await skillLoadTool.execute({ skillName: 'dup' }, makeContext(workspace));
    expect(result.content).toContain('NewPath');
  });

  it('throws when the skill does not exist anywhere', async () => {
    await expect(
      skillLoadTool.execute({ skillName: 'missing' }, makeContext(workspace))
    ).rejects.toThrow(/not found/);
  });
});

describe('skillLoadTool — typed args validation', () => {
  it('returns parsedArgs when args match the declared inputs schema', async () => {
    const dir = path.join(workspace, '.chimera', 'skills');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'typed.md'),
      [
        '---',
        'name: typed',
        'description: "A skill with typed inputs"',
        'inputs:',
        '  topic: string',
        '  depth: number?',
        '---',
        '',
        '# Typed skill',
        '',
      ].join('\n'),
      'utf-8'
    );

    const result = await skillLoadTool.execute(
      { skillName: 'typed', args: { topic: 'auth', depth: 2 } },
      makeContext(workspace)
    );
    expect(result.parsedArgs).toEqual({ topic: 'auth', depth: 2 });
    expect(result.content).toContain('Typed skill');
  });

  it('rejects args when the required field is missing', async () => {
    const dir = path.join(workspace, '.chimera', 'skills');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'r.md'),
      '---\nname: r\ninputs:\n  topic: string\n---\n\n# R\n',
      'utf-8'
    );

    await expect(
      skillLoadTool.execute({ skillName: 'r', args: {} }, makeContext(workspace))
    ).rejects.toThrow(/rejected args/);
  });

  it('rejects args with the wrong type', async () => {
    const dir = path.join(workspace, '.chimera', 'skills');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'n.md'),
      '---\nname: n\ninputs:\n  count: number\n---\n\n# N\n',
      'utf-8'
    );

    await expect(
      skillLoadTool.execute({ skillName: 'n', args: { count: 'five' } }, makeContext(workspace))
    ).rejects.toThrow(/rejected args/);
  });

  it('allows args to be omitted for skills that do not declare inputs', async () => {
    const dir = path.join(workspace, '.chimera', 'skills');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'plain.md'),
      '---\nname: plain\ndescription: "no inputs block"\n---\n\n# Plain\n',
      'utf-8'
    );

    const result = await skillLoadTool.execute({ skillName: 'plain' }, makeContext(workspace));
    expect(result.skillName).toBe('plain');
    expect(result.parsedArgs).toBeUndefined();
    expect(result.content).toContain('Plain');
  });

  it('rejects any args for a skill that does not declare inputs (strict-empty)', async () => {
    const dir = path.join(workspace, '.chimera', 'skills');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'strict.md'),
      '---\nname: strict\ndescription: "no inputs block"\n---\n\n# Strict\n',
      'utf-8'
    );

    await expect(
      skillLoadTool.execute({ skillName: 'strict', args: { anything: 1 } }, makeContext(workspace))
    ).rejects.toThrow(/rejected args/);
  });

  it('returns parsedArgs only when args were passed', async () => {
    const dir = path.join(workspace, '.chimera', 'skills');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'cond.md'),
      '---\nname: cond\ninputs:\n  q: string\n---\n\n# Cond\n',
      'utf-8'
    );

    const r1 = await skillLoadTool.execute({ skillName: 'cond' }, makeContext(workspace));
    expect(r1.parsedArgs).toBeUndefined();

    const r2 = await skillLoadTool.execute({ skillName: 'cond', args: { q: 'x' } }, makeContext(workspace));
    expect(r2.parsedArgs).toEqual({ q: 'x' });
  });
});

describe('skillLoadTool — legacy deprecation shim', () => {
  it('emits a one-time stderr warning when reading from .kilo/skills/', async () => {
    const dir = path.join(workspace, '.kilo', 'skills');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'old.md'), '# Old\n', 'utf-8');

    const stderrWrites: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as unknown as { write: (s: string) => boolean }).write = ((chunk: unknown) => {
      stderrWrites.push(String(chunk));
      return true;
    }) as unknown as typeof process.stderr.write;

    try {
      // Two calls — only one warning expected.
      await skillLoadTool.execute({ skillName: 'old' }, makeContext(workspace));
      await skillLoadTool.execute({ skillName: 'old' }, makeContext(workspace));
    } finally {
      (process.stderr as unknown as { write: typeof origWrite }).write = origWrite;
    }

    const relevant = stderrWrites.filter((w) => w.includes('DEPRECATION'));
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toContain('legacy path');
  });
});
