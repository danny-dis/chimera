import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  loadSkill,
  loadSkillsForMode,
  parseSkillFile,
  buildInputsSchema,
  resolveSkillPath,
  _resetLegacyWarnings,
} from '../skill-loader.js';
import { SKILL_BUNDLES } from '../skill-bundles.js';
import { parseSkillPack, resolveSkillPack } from '../skill-pack.js';
import { EventStream } from '../../event-stream.js';

let workspace: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-loader-'));
  _resetLegacyWarnings();
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// parseSkillFile
// ---------------------------------------------------------------------------

describe('parseSkillFile', () => {
  it('parses name + description + inputs from frontmatter', () => {
    const raw = [
      '---',
      'name: my-skill',
      'description: "A test skill"',
      'inputs:',
      '  topic: string',
      '  depth: number?',
      '---',
      '',
      '# My Skill',
      '',
      'Body content.',
    ].join('\n');

    const { frontmatter, body } = parseSkillFile(raw);
    expect(frontmatter.name).toBe('my-skill');
    expect(frontmatter.description).toBe('A test skill');
    expect(frontmatter.inputs).toEqual({ topic: 'string', depth: 'number?' });
    expect(body).toContain('My Skill');
    expect(body).toContain('Body content.');
    expect(body.startsWith('---')).toBe(false);
  });

  it('returns empty frontmatter when no --- block is present', () => {
    const raw = '# Just a heading\n\nNo frontmatter here.';
    const { frontmatter, body } = parseSkillFile(raw);
    expect(frontmatter).toEqual({});
    expect(body).toBe(raw);
  });

  it('returns empty frontmatter on YAML parse error', () => {
    const raw = '---\n: invalid: yaml: ::\n---\n# Body\n';
    const { frontmatter, body } = parseSkillFile(raw);
    expect(frontmatter).toEqual({});
    expect(body).toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// buildInputsSchema
// ---------------------------------------------------------------------------

describe('buildInputsSchema', () => {
  it('returns a strict-empty schema for undefined inputs', () => {
    const schema = buildInputsSchema(undefined);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ a: 1 }).success).toBe(false);
  });

  it('builds a schema for string, number, and boolean fields', () => {
    const schema = buildInputsSchema({ a: 'string', b: 'number', c: 'boolean' });
    expect(schema.safeParse({ a: 'x', b: 1, c: true }).success).toBe(true);
    expect(schema.safeParse({ a: 'x', b: 1, c: 'no' }).success).toBe(false);
  });

  it('builds array schemas for string[] and number[]', () => {
    const schema = buildInputsSchema({ tags: 'string[]', ids: 'number[]' });
    expect(schema.safeParse({ tags: ['a', 'b'], ids: [1, 2, 3] }).success).toBe(true);
    expect(schema.safeParse({ tags: [1], ids: [1] }).success).toBe(false);
  });

  it('marks fields with ? as optional', () => {
    const schema = buildInputsSchema({ topic: 'string', depth: 'number?' });
    expect(schema.safeParse({ topic: 'x' }).success).toBe(true);
    expect(schema.safeParse({ topic: 'x', depth: 2 }).success).toBe(true);
    expect(schema.safeParse({ depth: 2 }).success).toBe(false);
  });

  it('throws on an unknown type token', () => {
    expect(() => buildInputsSchema({ a: 'weird-type' })).toThrow(/unknown inputs type/);
  });
});

// ---------------------------------------------------------------------------
// Path resolution + loadSkill
// ---------------------------------------------------------------------------

describe('loadSkill — path resolution', () => {
  it('loads from <workspace>/.chimera/skills/', async () => {
    const dir = path.join(workspace, '.chimera', 'skills');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'foo.md'), '# Foo\n', 'utf-8');

    const loaded = loadSkill('foo', workspace);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('foo');
    expect(loaded!.source).toBe('workspace');
    expect(loaded!.content).toContain('Foo');
  });

  it('falls back to legacy .kilo/skills/ when .chimera/ is absent', async () => {
    const dir = path.join(workspace, '.kilo', 'skills');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'bar.md'), '# Bar\n', 'utf-8');

    const loaded = loadSkill('bar', workspace);
    expect(loaded).not.toBeNull();
    expect(loaded!.source).toBe('workspace'); // legacy maps to workspace
  });

  it('returns null when the skill does not exist anywhere', () => {
    const loaded = loadSkill('nope', workspace);
    expect(loaded).toBeNull();
  });

  it('prefers .chimera/skills/ over .kilo/skills/', async () => {
    const newDir = path.join(workspace, '.chimera', 'skills');
    const oldDir = path.join(workspace, '.kilo', 'skills');
    await fs.mkdir(newDir, { recursive: true });
    await fs.mkdir(oldDir, { recursive: true });
    await fs.writeFile(path.join(newDir, 'dup.md'), '# New\n', 'utf-8');
    await fs.writeFile(path.join(oldDir, 'dup.md'), '# Old\n', 'utf-8');

    const loaded = loadSkill('dup', workspace);
    expect(loaded!.content).toContain('New');
  });
});

describe('resolveSkillPath', () => {
  it('returns the resolved metadata', async () => {
    const dir = path.join(workspace, '.chimera', 'skills');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'a.md'), '', 'utf-8');

    const r = resolveSkillPath('a', workspace);
    expect(r).not.toBeNull();
    expect(r!.source).toBe('workspace');
    expect(r!.legacy).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadSkillsForMode — bundle + pack composition
// ---------------------------------------------------------------------------

describe('SKILL_BUNDLES', () => {
  it('has an entry for every Mode', () => {
    const modes: Array<keyof typeof SKILL_BUNDLES> = ['ask', 'plan', 'code', 'debug', 'review', 'oal'];
    for (const m of modes) {
      expect(Array.isArray(SKILL_BUNDLES[m])).toBe(true);
    }
  });

  it('default code bundle is chimera-modes + chimera-workflows', () => {
    expect(SKILL_BUNDLES.code).toContain('chimera-modes');
    expect(SKILL_BUNDLES.code).toContain('chimera-workflows');
  });
});

describe('loadSkillsForMode', () => {
  it('silently skips missing bundle skills and returns the rest', async () => {
    const dir = path.join(workspace, '.chimera', 'skills');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'custom-skill.md'),
      '# Custom\n',
      'utf-8'
    );

    const skills = loadSkillsForMode({ mode: 'code', workspaceRoot: workspace });
    const names = skills.map((s) => s.name);
    expect(names).toContain('chimera-modes');
    expect(names).toContain('chimera-workflows');
    expect(names).toContain('chimera-tool-loop');
  });

  it('returns bundled skills for oal mode', () => {
    const skills = loadSkillsForMode({ mode: 'oal', workspaceRoot: workspace });
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.every((s) => s.source === 'bundled')).toBe(true);
  });

  it('emits a skill_loaded event per loaded skill when eventStream is provided', async () => {
    const stream = new EventStream();
    const skills = loadSkillsForMode({ mode: 'code', workspaceRoot: workspace, eventStream: stream });
    expect(skills.length).toBeGreaterThan(0);

    const events = stream.getByType('skill_loaded');
    expect(events.length).toBe(skills.length);
    const eventNames = events.map((e) => (e as { skillName: string }).skillName).sort();
    const skillNames = skills.map((s) => s.name).sort();
    expect(eventNames).toEqual(skillNames);
  });

  it('does not throw when eventStream is omitted', () => {
    expect(() =>
      loadSkillsForMode({ mode: 'code', workspaceRoot: workspace })
    ).not.toThrow();
  });

  it('loads pack skills with source=pack and bundles with bundled', async () => {
    const skillDir = path.join(workspace, '.chimera', 'skills');
    await fs.mkdir(skillDir, { recursive: true });

    const packDir = path.join(workspace, '.chimera', 'skill-packs');
    await fs.mkdir(packDir, { recursive: true });
    await fs.writeFile(
      path.join(packDir, 'code.md'),
      '---\nname: code\nmode: code\nskills:\n  - chimera-modes\n  - missing-skill\n---\n',
      'utf-8'
    );

    const skills = loadSkillsForMode({ mode: 'code', workspaceRoot: workspace });
    const byName = Object.fromEntries(skills.map((s) => [s.name, s.source]));
    expect(byName['chimera-modes']).toBe('pack');
    expect(byName['chimera-workflows']).toBe('bundled');
  });

  it('silently skips an unparseable pack file and returns bundled skills', async () => {
    const packDir = path.join(workspace, '.chimera', 'skill-packs');
    await fs.mkdir(packDir, { recursive: true });
    await fs.writeFile(path.join(packDir, 'code.md'), 'this is not frontmatter\n', 'utf-8');

    const skills = loadSkillsForMode({ mode: 'code', workspaceRoot: workspace });
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.every((s) => s.source === 'bundled')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseSkillPack + resolveSkillPack
// ---------------------------------------------------------------------------

describe('parseSkillPack', () => {
  it('parses a valid pack', () => {
    const raw = [
      '---',
      'name: code-review-pack',
      'description: "Bundled skills for code review"',
      'mode: code',
      'skills:',
      '  - chimera-modes',
      '  - chimera-workflows',
      '---',
    ].join('\n');
    const pack = parseSkillPack(raw);
    expect(pack.name).toBe('code-review-pack');
    expect(pack.mode).toBe('code');
    expect(pack.skills).toEqual(['chimera-modes', 'chimera-workflows']);
  });

  it('throws when frontmatter is missing', () => {
    expect(() => parseSkillPack('# no frontmatter')).toThrow(/missing YAML frontmatter/);
  });

  it("throws when 'name' is missing", () => {
    const raw = '---\nmode: code\nskills: [a]\n---\n';
    expect(() => parseSkillPack(raw)).toThrow(/'name' is required/);
  });

  it("throws when 'skills' is empty or missing", () => {
    const raw = '---\nname: x\nmode: code\nskills: []\n---\n';
    expect(() => parseSkillPack(raw)).toThrow(/'skills' must be a non-empty array/);
  });
});

describe('resolveSkillPack', () => {
  it('resolves each named skill with source=pack and silently skips missing', async () => {
    const dir = path.join(workspace, '.chimera', 'skills');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'chimera-modes.md'), '# A\n', 'utf-8');

    const pack = {
      name: 'p',
      description: '',
      mode: 'code',
      skills: ['chimera-modes', 'does-not-exist'],
    };
    const records = await resolveSkillPack(pack, workspace);
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe('chimera-modes');
    expect(records[0].source).toBe('pack');
  });
});
