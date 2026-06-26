import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { WorkflowLoader, WorkflowAutoLoader, workflowLoaderSchema } from '../loader.js';

let workspace: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-loader-'));
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('workflowLoaderSchema', () => {
  it('accepts a minimal valid workflow', () => {
    const result = workflowLoaderSchema.safeParse({
      name: 'ci',
      steps: [{ id: 's1', kind: 'tool', config: { name: 'lint' } }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a workflow without a name', () => {
    const result = workflowLoaderSchema.safeParse({ steps: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an empty steps array', () => {
    const result = workflowLoaderSchema.safeParse({ name: 'x', steps: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown step kind', () => {
    const result = workflowLoaderSchema.safeParse({
      name: 'x',
      steps: [{ id: 's1', kind: 'mystery', config: {} }],
    });
    expect(result.success).toBe(false);
  });
});

describe('WorkflowLoader.loadFromFile', () => {
  it('loads a YAML workflow', async () => {
    const file = path.join(workspace, 'review.yaml');
    await fs.writeFile(
      file,
      [
        'name: review',
        'description: PR review pipeline',
        'tags: [ci, review]',
        'steps:',
        '  - id: classify',
        '    kind: llm',
        '    config: { prompt: "classify" }',
        '  - id: gate',
        '    kind: gate',
        '    config: { expr: "state.classify == \\"trivial\\"" }',
        '    required: true',
        '',
      ].join('\n'),
      'utf-8'
    );

    const loader = new WorkflowLoader();
    const wf = await loader.loadFromFile(file);

    expect(wf.name).toBe('review');
    expect(wf.description).toBe('PR review pipeline');
    expect(wf.tags).toEqual(['ci', 'review']);
    expect(wf.steps).toHaveLength(2);
    expect(wf.steps[0].kind).toBe('llm');
    expect(wf.steps[1].required).toBe(true);
    expect(wf.path).toBe(file);
  });

  it('loads a JSON workflow', async () => {
    const file = path.join(workspace, 'ship.json');
    await fs.writeFile(
      file,
      JSON.stringify({
        name: 'ship',
        steps: [{ id: 'build', kind: 'tool', config: { name: 'build' } }],
      }),
      'utf-8'
    );

    const loader = new WorkflowLoader();
    const wf = await loader.loadFromFile(file);
    expect(wf.name).toBe('ship');
    expect(wf.steps[0].kind).toBe('tool');
    expect(wf.path).toBe(file);
  });

  it('throws a descriptive error for an invalid file', async () => {
    const file = path.join(workspace, 'bad.yaml');
    await fs.writeFile(file, 'name: bad\nsteps: []\n', 'utf-8');

    const loader = new WorkflowLoader();
    await expect(loader.loadFromFile(file)).rejects.toThrow(/steps must contain at least one step/);
  });

  it('throws on invalid JSON', async () => {
    const file = path.join(workspace, 'broken.json');
    await fs.writeFile(file, '{ this is not json', 'utf-8');

    const loader = new WorkflowLoader();
    await expect(loader.loadFromFile(file)).rejects.toThrow(/Invalid JSON/);
  });
});

describe('WorkflowLoader.loadFromDir', () => {
  it('loads every .yaml/.yml/.json file in a directory', async () => {
    const dir = path.join(workspace, 'wf');
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, 'a.yaml'),
      'name: a\nsteps:\n  - { id: s1, kind: llm, config: {} }\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(dir, 'b.yml'),
      'name: b\nsteps:\n  - { id: s1, kind: tool, config: { name: t } }\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(dir, 'c.json'),
      JSON.stringify({ name: 'c', steps: [{ id: 's1', kind: 'gate', config: {} }] }),
      'utf-8'
    );
    // unrelated file — should be ignored
    await fs.writeFile(path.join(dir, 'README.md'), '# nope', 'utf-8');

    const loader = new WorkflowLoader(dir);
    const wfs = await loader.loadFromDir();
    expect(wfs.map((w) => w.name).sort()).toEqual(['a', 'b', 'c']);
  });

  it('throws when called with no directory and no defaultDir', async () => {
    const loader = new WorkflowLoader();
    await expect(loader.loadFromDir()).rejects.toThrow(/directory not specified/);
  });
});

describe('WorkflowAutoLoader', () => {
  it('registers all valid workflows from <workspace>/.chimera/workflows/', async () => {
    const dir = path.join(workspace, '.chimera', 'workflows');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'review.yaml'),
      'name: review\nsteps:\n  - { id: s1, kind: llm, config: {} }\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(dir, 'ship.json'),
      JSON.stringify({ name: 'ship', steps: [{ id: 's1', kind: 'tool', config: {} }] }),
      'utf-8'
    );

    const auto = new WorkflowAutoLoader();
    const { registry, workflows } = await auto.loadIntoRegistry(workspace);

    expect(workflows).toHaveLength(2);
    expect(registry.has('review')).toBe(true);
    expect(registry.has('ship')).toBe(true);
    expect(registry.list()).toHaveLength(2);
  });

  it('returns an empty registry when the workflows dir is missing', async () => {
    const auto = new WorkflowAutoLoader();
    const { registry, workflows } = await auto.loadIntoRegistry(workspace);
    expect(workflows).toEqual([]);
    expect(registry.list()).toEqual([]);
  });
});
