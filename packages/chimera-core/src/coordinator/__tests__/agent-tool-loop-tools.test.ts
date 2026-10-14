import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { runAgentToolLoop } from '../agent-tool-loop.js';
import { EventStream } from '../../event-stream.js';
import type { LLMProvider } from '../../session-orchestrator.js';

const schema = { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] };

describe('shared tool-loop continuation', () => {
  it.each(['solo', 'trio'] as const)('keeps tools available for read-to-write execution in %s mode', async mode => {
    const root = mkdtempSync(join(tmpdir(), 'chimera-followup-'));
    const executed: string[] = [];
    const calls: Record<string, unknown>[] = [];
    const tools = [{ name: 'read_file', description: 'Read a file', parameters: schema },
      { name: 'write_file', description: 'Write a file', parameters: schema }];
    writeFileSync(join(root, 'source.txt'), 'observed');
    const provider: LLMProvider = { complete: async (messages, options) => {
      calls.push(options ?? {});
      if (!options?.tools) return { content: 'I would write the result.' };
      if (executed.length === 1) return { content: '', toolCalls: [{ id: 'write', name: 'write_file', arguments: { path: 'result.txt', content: 'observed' } }] };
      expect(messages.some(message => message.role === 'tool')).toBe(true);
      return { content: 'Result written.', usage: { inputTokens: 2, outputTokens: 3 } };
    } };
    try {
      const result = await runAgentToolLoop({
        provider, messages: [{ role: 'user', content: 'Read source.txt, then write result.txt.' }],
        options: { temperature: 0 }, toolDefs: tools, toolRegistry: null,
        toolExecutor: { execute: async (name, args) => {
          executed.push(name);
          if (name === 'write_file') writeFileSync(join(root, String(args.path)), String(args.content));
          return { success: true, data: name === 'read_file' ? readFileSync(join(root, String(args.path)), 'utf8') : 'written', duration: 0 };
        } }, eventStream: new EventStream(), workspaceRoot: root, sessionId: 'followup',
        initialContent: '', initialToolCalls: [{ id: 'read', name: 'read_file', arguments: { path: 'source.txt' } }],
        maxRounds: 2, mode,
      });
      expect(executed).toEqual(['read_file', 'write_file']);
      expect(readFileSync(join(root, 'result.txt'), 'utf8')).toBe('observed');
      expect(result.content).toBe('Result written.');
      expect(result.toolCalls).toEqual([]);
      expect(result.wroteFileCount).toBe(1);
      for (const options of calls) {
        expect(options.tools).toEqual(tools);
        expect(options.toolChoice).toBe('auto');
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('serializes existing Zod definitions without widening an explicit tool choice', async () => {
    const root = mkdtempSync(join(tmpdir(), 'chimera-followup-schema-'));
    const choice = 'none';
    let received: Record<string, unknown> | undefined;
    try {
      await runAgentToolLoop({
        provider: { complete: async (_messages, options) => { received = options; return { content: 'Read complete.' }; } },
        messages: [{ role: 'user', content: 'Inspect only.' }], options: { toolChoice: choice },
        toolDefs: [{ name: 'read_file', description: 'Read a file', parameters: z.object({ path: z.string() }) as unknown as Record<string, unknown> }],
        toolExecutor: { execute: async () => ({ success: true, data: 'content', duration: 0 }) },
        toolRegistry: null, eventStream: new EventStream(), workspaceRoot: root, sessionId: 'schema',
        initialContent: '', initialToolCalls: [{ id: 'read', name: 'read_file', arguments: { path: 'source.txt' } }], maxRounds: 1,
      });
      expect((received?.tools as Array<{ parameters: unknown }>)?.[0]?.parameters).toEqual(schema);
      expect(received?.toolChoice).toBe(choice);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
