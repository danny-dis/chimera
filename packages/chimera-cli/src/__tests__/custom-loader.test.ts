import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  loadCustomCommands,
  runCustomCommand,
  substituteArgs,
  parseCommandFile,
} from '../commands/custom-loader.js';

describe('custom-loader', () => {
  let workspaceRoot: string;
  let homeDir: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-cmd-'));
    homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-home-'));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
    await fs.rm(homeDir, { recursive: true, force: true });
  });

  it('loads commands from .chimera/commands/ and substitutes ${N} + $ARGUMENTS', async () => {
    const dir = path.join(workspaceRoot, '.chimera', 'commands');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'review.md'),
      [
        '---',
        'description: Review a file',
        'argument-hint: <file>',
        'allowed-tools: [Bash, Read]',
        'model: haiku',
        '---',
        'Open ${1} and review it line by line. Full args: $ARGUMENTS',
      ].join('\n'),
      'utf-8',
    );

    const cmds = await loadCustomCommands({ workspaceRoot, homeDir });
    expect(cmds.has('review')).toBe(true);
    const review = cmds.get('review')!;
    expect(review.description).toBe('Review a file');
    expect(review.argumentHint).toBe('<file>');
    expect(review.allowedTools).toEqual(['Bash', 'Read']);
    expect(review.model).toBe('haiku');
    expect(review.source).toBe('workspace');

    const rendered = substituteArgs(review.body, ['src/foo.ts']);
    expect(rendered).toContain('Open src/foo.ts and review it line by line.');
    expect(rendered).toContain('Full args: src/foo.ts');
  });

  it('workspace command overrides a same-named user command', async () => {
    const userDir = path.join(homeDir, '.chimera', 'commands');
    const workspaceDir = path.join(workspaceRoot, '.chimera', 'commands');
    await fs.mkdir(userDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });

    await fs.writeFile(
      path.join(userDir, 'lint.md'),
      '---\ndescription: USER VERSION\n---\nuser body',
      'utf-8',
    );
    await fs.writeFile(
      path.join(workspaceDir, 'lint.md'),
      '---\ndescription: WORKSPACE VERSION\n---\nworkspace body',
      'utf-8',
    );

    const cmds = await loadCustomCommands({ workspaceRoot, homeDir });
    const lint = cmds.get('lint');
    expect(lint).toBeDefined();
    expect(lint!.source).toBe('workspace');
    expect(lint!.description).toBe('WORKSPACE VERSION');
    expect(lint!.body.trim()).toBe('workspace body');
  });

  it('runCustomCommand prints "Unknown custom command" for a missing name', async () => {
    const captured: string[] = [];
    const original = console.log;
    console.log = (...parts: unknown[]) => {
      captured.push(parts.map((p) => String(p)).join(' '));
    };
    try {
      await runCustomCommand('nope', [], null);
    } finally {
      console.log = original;
    }
    const text = captured.join('\n');
    expect(text).toContain('Unknown custom command');
    expect(text).toContain('/nope');
  });

  it('parseCommandFile tolerates missing frontmatter', () => {
    const cmd = parseCommandFile(
      '/tmp/notes.md',
      'just a body with no frontmatter',
      'workspace',
    );
    expect(cmd.name).toBe('notes');
    expect(cmd.body).toContain('just a body with no frontmatter');
    expect(cmd.description).toBe('');
    expect(cmd.allowedTools).toEqual([]);
    expect(cmd.model).toBeNull();
  });
});
