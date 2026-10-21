import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { runAgentToolLoop } from '../agent-tool-loop.js';
import { DuoExecutor } from '../duo-executor.js';
import { EventStream } from '../../event-stream.js';
import { SimpleModelRegistry } from '@chimera/providers';

it.each(['edit_block', 'search_replace', 'apply_patch'])('recognizes a real %s edit without forcing a destructive rewrite', async name => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-real-edit-'));
  let forced = 0;
  const nudges: string[] = [];
  writeFileSync(join(root, 'calc.js'), 'exports.add=(a,b)=>a+b;\n');
  try {
    const result = await runAgentToolLoop({
      provider: { complete: async (messages, options) => {
        nudges.push(messages.at(-1)!.content);
        if (typeof options?.toolChoice === 'object') forced++;
        return { content: 'Subtraction added; addition preserved.' };
      } },
      messages: [], options: {}, toolRegistry: null,
      toolExecutor: { execute: async () => {
        writeFileSync(join(root, 'calc.js'), 'exports.add=(a,b)=>a+b;exports.sub=(a,b)=>a-b;\n');
        return { success: true, data: { applied: true }, duration: 0 };
      } },
      eventStream: new EventStream(), workspaceRoot: root, sessionId: 'edit',
      initialContent: '', initialToolCalls: [{ id: 'edit', name, arguments: { path: 'calc.js' } }],
      maxRounds: 1, wantsFiles: true, forceMinFiles: 1, task: 'Edit calc.js to add subtraction while preserving addition.',
      toolDefs: [{ name: 'write_file', description: 'Write', parameters: {} }],
    });
    expect(result.wroteFileCount).toBe(1);
    expect(forced).toBe(0);
    expect(nudges.join('\n')).not.toContain('You have NOT created');
    expect(readFileSync(join(root, 'calc.js'), 'utf8')).toContain('exports.add=');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it.each([true, false])('does not count an unchanged edit (success=%s)', async success => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-noop-edit-'));
  writeFileSync(join(root, 'calc.js'), 'exports.add=(a,b)=>a+b;\n');
  let forced = 0;
  try {
    const result = await runAgentToolLoop({
      provider: { complete: async (_messages, options) => {
        if (typeof options?.toolChoice === 'object') forced++;
        return { content: 'No changes.' };
      } }, messages: [], options: {}, toolRegistry: null,
      toolExecutor: { execute: async () => ({ success, duration: 0 }) },
      eventStream: new EventStream(), workspaceRoot: root, sessionId: 'noop',
      initialContent: '', initialToolCalls: [{ id: 'edit', name: 'edit_block', arguments: { path: 'calc.js' } }],
      maxRounds: 1, wantsFiles: true, forceMinFiles: 1, task: 'Edit calc.js to add subtraction.',
      toolDefs: [{ name: 'write_file', description: 'Write', parameters: {} }],
    });
    expect(result.wroteFileCount).toBe(0);
    expect(forced).toBe(1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('executes the last allowed response without requesting another completion or forcing a rewrite', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-final-tool-batch-'));
  const executed: string[] = [];
  let completions = 0;
  writeFileSync(join(root, 'calc.js'), 'exports.add=(a,b)=>a+b;\n');
  try {
    const result = await runAgentToolLoop({
      provider: { complete: async () => {
        completions++;
        return { content: '', toolCalls: [{ id: 'edit', name: 'edit_block', arguments: { path: 'calc.js' } }] };
      } }, messages: [], options: {}, toolRegistry: null,
      toolExecutor: { execute: async name => {
        executed.push(name);
        if (name === 'edit_block') writeFileSync(join(root, 'calc.js'), 'exports.add=(a,b)=>a+b;exports.sub=(a,b)=>a-b;\n');
        return { success: true, duration: 0 };
      } },
      eventStream: new EventStream(), workspaceRoot: root, sessionId: 'final-batch',
      initialContent: '', initialToolCalls: [{ id: 'read', name: 'read_file', arguments: { path: 'calc.js' } }],
      maxRounds: 1, wantsFiles: true, forceMinFiles: 1, task: 'Edit calc.js to add subtraction.',
      toolDefs: [{ name: 'edit_block', description: 'Edit', parameters: {} }],
    });
    expect(executed).toEqual(['read_file', 'edit_block']);
    expect(completions).toBe(1);
    expect(result.toolCalls).toEqual([]);
    expect(result.wroteFileCount).toBe(1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('does not drain the final batch after cancellation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-final-batch-abort-'));
  const controller = new AbortController();
  const executed: string[] = [];
  try {
    await expect(runAgentToolLoop({
      provider: { complete: async () => {
        controller.abort();
        return { content: '', toolCalls: [{ id: 'late-write', name: 'write_file', arguments: { path: 'calc.js' } }] };
      } }, messages: [], options: {}, toolRegistry: null,
      toolExecutor: { execute: async name => { executed.push(name); return { success: true, duration: 0 }; } },
      eventStream: new EventStream(), workspaceRoot: root, sessionId: 'final-abort', signal: controller.signal,
      initialContent: '', initialToolCalls: [{ id: 'read', name: 'read_file', arguments: { path: 'calc.js' } }], maxRounds: 1,
    })).rejects.toThrow(/Aborted/);
    expect(executed).toEqual(['read_file']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('gives the writable duo writer tools on its first request, not the reviewer', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-duo-first-tools-'));
  const seen: Array<{ id: string; tools: unknown }> = [];
  writeFileSync(join(root, 'calc.js'), 'exports.add=(a,b)=>a+b;\n');
  const executor = new DuoExecutor({ eventStream: new EventStream(), registry: new SimpleModelRegistry(), workspaceRoot: root,
    toolRegistry: { getAll: () => [{ name: 'edit_block', description: 'Edit', parameters: z.object({ path: z.string() }) }] } as any,
    toolExecutor: { execute: async () => ({ success: true, data: {}, duration: 0 }) },
  });
  try {
    await executor.executeWithAnalysis('Explain this existing calc.js without edits.', { modelA: 'writer', modelB: 'reviewer' }, id => ({ complete: async (_messages, options) => {
      seen.push({ id, tools: options?.tools });
      return { content: 'The calculator exports addition.' };
    } }));
    expect(seen[0].id).toBe('writer');
    expect(seen[0].tools).toMatchObject([{ name: 'edit_block', parameters: { type: 'object' } }]);
    expect(seen.filter(call => call.id === 'reviewer').every(call => !call.tools)).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
