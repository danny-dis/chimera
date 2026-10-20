import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgentToolLoop } from '../agent-tool-loop.js';
import { EventStream } from '../../event-stream.js';

it.each(['solo', 'trio'] as const)('retains observed exports and failed tool results during forced writes (%s)', async mode => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-force-context-'));
  const original = 'module.exports = { calc: (op,a,b) => null };\n';
  const edited = 'module.exports = { calc: (op,a,b) => op === "sub" ? a-b : null };\n';
  const task = 'Edit calc.js to add subtraction; preserve its public exports.';
  let writes = 0;
  let forced = 0;
  const forcedMessages: Array<Array<{ role: string; content: string }>> = [];
  writeFileSync(join(root, 'calc.js'), original);
  try {
    const result = await runAgentToolLoop({
      provider: { complete: async (messages, options) => {
        if (typeof options?.toolChoice !== 'object') return { content: 'I will preserve the observed export.' };
        forced++;
        forcedMessages.push(structuredClone(messages));
        return { content: '', toolCalls: [{ id: `write-${forced}`, name: 'write_file', arguments: { path: 'calc.js', content: edited } }] };
      } },
      messages: [{ role: 'user', content: task }], options: {}, toolRegistry: null,
      toolExecutor: { execute: async name => {
        if (name === 'read_file') return { success: true, data: original, duration: 0 };
        writes++;
        if (writes === 1) return { success: false, error: 'Transient write denied', duration: 0 };
        writeFileSync(join(root, 'calc.js'), edited);
        return { success: true, data: 'written', duration: 0 };
      } },
      eventStream: new EventStream(), workspaceRoot: root, sessionId: 'force-context',
      initialContent: '', initialToolCalls: [{ id: 'read', name: 'read_file', arguments: { path: 'calc.js' } }],
      maxRounds: 1, wantsFiles: true, forceMinFiles: 2, task, mode,
      toolDefs: [{ name: 'write_file', description: 'Write', parameters: { type: 'object' } }],
    });
    expect(forced).toBe(2);
    for (const messages of forcedMessages) {
      expect(messages.some(message => message.role === 'tool' && message.content.includes(original.trim()))).toBe(true);
      expect(messages.some(message => message.role === 'user' && message.content === task)).toBe(true);
    }
    expect(JSON.stringify(forcedMessages[1])).toContain('Transient write denied');
    expect(result.wroteFileCount).toBe(1);
    expect(result.messages.filter(message => message.role === 'tool')).toHaveLength(3);
    expect(readFileSync(join(root, 'calc.js'), 'utf8')).toBe(edited);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
