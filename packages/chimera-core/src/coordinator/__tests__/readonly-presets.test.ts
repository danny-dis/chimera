import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { SimpleModelRegistry } from '@chimera/providers';
import { EventStream } from '../../event-stream.js';
import type { LLMProvider, ToolExecutorInterface } from '../../session-orchestrator.js';
import type { Mode } from '../../types/agent.js';
import { DeliberationEngine } from '../deliberation/engine.js';
import type { DeliberationConfig } from '../deliberation/types.js';

const task = 'Plan a Node.js CLI in hello.js; explain implementation and verification. Do not edit any files.';
const answer = 'Implementation plan: use a Node.js CLI entry point; verify stdout is hello.';
const narration = `${answer}\n### ACTION: WRITE hello.js\n\`\`\`js\nconsole.log("hello");\n\`\`\``;
const configs: DeliberationConfig[] = [
  { mode: 'solo', model: 'writer', task, eternalCoT: false, selfVerify: false },
  { mode: 'duo', modelA: 'writer', modelB: 'reviewer', task },
  { mode: 'trio', writer: 'writer', reviewer: 'reviewer', challenger: 'challenger', task },
  { mode: 'fusion', analysisModels: ['writer', 'panel'], judgeModel: 'judge', task },
];
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function setup(mode: Mode | undefined, nativeCalls = false) {
  const root = mkdtempSync(join(tmpdir(), 'chimera-readonly-'));
  roots.push(root);
  writeFileSync(join(root, 'hello.js'), 'original');
  const tools = [
    { name: 'read_file', permissionLevel: 'read' },
    { name: 'inspect_project', permissionLevel: 'read' },
    { name: 'write_file', permissionLevel: 'write' },
    { name: 'run_shell_command', permissionLevel: 'execute' },
    { name: 'unclassified' },
  ].map(tool => ({ ...tool, description: tool.name, parameters: z.object({ path: z.string().optional() }) }));
  const execute = vi.fn<ToolExecutorInterface['execute']>(async (name, _args, _context) => {
    if (name !== 'read_file') writeFileSync(join(root, 'hello.js'), 'modified');
    return { success: true, data: { content: 'original' }, duration: 0 };
  });
  const calls: Array<{ id: string; messages: Array<{ role: string; content: string }>; options: any }> = [];
  const counts = new Map<string, number>();
  const engine = new DeliberationEngine({
    eventStream: new EventStream(), registry: new SimpleModelRegistry(), workspaceRoot: root,
    ...(mode ? { mode } : {}), toolExecutor: { execute },
    toolRegistry: { getAll: () => tools, has: name => tools.some(tool => tool.name === name) },
    providerFactory: id => ({
      complete: async (messages, options) => {
        calls.push({ id, messages: messages as any, options });
        const count = counts.get(id) ?? 0;
        counts.set(id, count + 1);
        if (id === 'judge') return { content: JSON.stringify({ finalResponse: answer, confidence: 0.9 }) };
        if (id === 'reviewer') return { content: JSON.stringify({ verdict: 'PASS', confidence: 0.9, findings: [], response: answer }) };
        if (id === 'challenger') return { content: JSON.stringify({ challenges: [], alternatives: [] }) };
        return {
          content: narration,
          ...(nativeCalls && count === 0 ? { toolCalls: [
            { id: `${id}-read`, name: 'read_file', arguments: { path: 'hello.js' } },
            ...['write_file', 'run_shell_command', 'unclassified'].map(name => ({ id: `${id}-${name}`, name, arguments: { path: 'hello.js', content: 'modified' } })),
          ] } : {}),
        };
      },
    } as LLMProvider),
  });
  return { engine, root, execute, calls };
}

describe.each(['plan', 'review'] as const)('%s preserves read-only deliberation', mode => {
  it.each(configs)('$mode does not force or apply narrated file writes', async config => {
    const { engine, root, execute, calls } = setup(mode);
    const result = await engine.run(config);
    expect(execute).not.toHaveBeenCalled();
    expect(result.mode).toBe(config.mode);
    expect(result.degraded).toBe(false);
    expect(result.degradationReason).toBeUndefined();
    expect(result.escalationReason ?? '').not.toContain('target was not modified');
    expect(result.output.trim()).not.toBe('');
    expect(result.analysis.confidence).toBeGreaterThan(0.1);
    expect(JSON.stringify(calls)).not.toMatch(/CALLING TOOLS|ALL files are written|Call write_file NOW|task REQUIRES|MODE: CODE/);
    expect(readFileSync(join(root, 'hello.js'), 'utf8')).toBe('original');
    expect(readdirSync(root)).toEqual(['hello.js']);
  });

  it.each(configs)('$mode retains read tools but blocks unsolicited native mutations', async config => {
    const { engine, root, execute, calls } = setup(mode, true);
    const result = await engine.run(config);
    expect(execute.mock.calls.map(call => call[0])).toEqual(config.mode === 'fusion' ? ['read_file', 'read_file'] : ['read_file']);
    expect(execute.mock.calls.every(call => call[2].mode === mode)).toBe(true);
    const firstWriter = calls.find(call => call.id === 'writer')!;
    expect(firstWriter.options.tools.map((tool: { name: string }) => tool.name)).toEqual(['read_file', 'inspect_project']);
    expect(result.mode).toBe(config.mode);
    expect(result.degradationReason).toBeUndefined();
    expect(JSON.stringify(calls)).not.toMatch(/Call write_file NOW|task REQUIRES/);
    expect(readFileSync(join(root, 'hello.js'), 'utf8')).toBe('original');
  });
});

it.each(configs)('unspecified mode retains $mode write fallback', async config => {
  const { engine, execute } = setup(undefined);
  await engine.run(config);
  expect(execute.mock.calls.some(call => call[0] === 'write_file')).toBe(true);
});
