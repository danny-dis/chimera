import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { DuoExecutor } from '../duo-executor.js';
import { EventStream } from '../../event-stream.js';
import { compactAgentPrompt } from '../../prompts.js';
import { SimpleModelRegistry } from '@chimera/providers';

it('retains the canonical coding contract on the duo writer first, follow-up and forced requests', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-duo-contract-'));
  const seen: Array<Array<{ role: string; content: string }>> = [];
  const original = 'module.exports = { calc: () => null };\n';
  const edited = 'module.exports = { calc: (op,a,b) => op === "sub" ? a-b : null };\n';
  writeFileSync(join(root, 'calc.js'), original);
  const executor = new DuoExecutor({
    eventStream: new EventStream(), registry: new SimpleModelRegistry(), workspaceRoot: root,
    toolRegistry: { getAll: () => ['read_file', 'write_file'].map(name => ({ name, description: name, parameters: z.object({ path: z.string() }) })) } as any,
    toolExecutor: { execute: async (name, args) => {
      if (name === 'read_file') return { success: true, data: readFileSync(join(root, 'calc.js'), 'utf8'), duration: 0 };
      writeFileSync(join(root, String(args.path)), String(args.content));
      return { success: true, data: 'written', duration: 0 };
    } },
  });
  try {
    await executor.executeWithAnalysis('Edit calc.js to add subtraction while preserving existing behavior.',
      { modelA: 'writer', modelB: 'reviewer' }, id => ({ complete: async (messages, options) => {
        if (id === 'reviewer') return { content: 'Reviewed.' };
        seen.push(structuredClone(messages));
        if (seen.length === 1) return { content: '', toolCalls: [{ id: 'read', name: 'read_file', arguments: { path: 'calc.js' } }] };
        if (typeof options?.toolChoice === 'object') return { content: '', toolCalls: [{ id: 'write', name: 'write_file', arguments: { path: 'calc.js', content: edited } }] };
        return { content: 'I will apply subtraction.' };
      } }));
    expect(seen).toHaveLength(3);
    for (const messages of seen) expect(messages.find(message => message.role === 'system')?.content).toBe(compactAgentPrompt('writer'));
    expect(readFileSync(join(root, 'calc.js'), 'utf8')).toBe(edited);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
