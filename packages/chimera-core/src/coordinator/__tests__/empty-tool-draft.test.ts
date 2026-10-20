import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { SimpleModelRegistry } from '@chimera/providers';
import { EventStream } from '../../event-stream.js';
import { TrioExecutor } from '../trio-executor.js';

it('supplies observed tool outcomes to review when the writer closes with empty prose', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-empty-tool-draft-'));
  writeFileSync(join(root, 'calc.js'), 'module.exports=0;');
  const tools = [
    { name: 'write_file', description: 'Write', parameters: z.object({ path: z.string(), content: z.string() }) },
    { name: 'run_shell_command', description: 'Run', parameters: z.object({ command: z.string() }) },
  ];
  let writerCalls = 0;
  let reviewed = '';
  const executor = new TrioExecutor({ eventStream: new EventStream(), registry: new SimpleModelRegistry(), workspaceRoot: root,
    toolRegistry: { getAll: () => tools, has: () => true } as any,
    toolExecutor: { execute: async name => {
      if (name === 'write_file') writeFileSync(join(root, 'calc.js'), 'module.exports=42;');
      return { success: true, data: name === 'run_shell_command'
        ? { exitCode: 1, stdout: 'PRIVATE_TOOL_OUTPUT' } : { content: 'PRIVATE_FILE_CONTENT' }, duration: 0 };
    } },
  });
  try {
    const result = await executor.executeWithAnalysis('Edit calc.js to export 42.', { writer: 'writer', reviewer: 'reviewer' }, model => ({
      complete: async messages => {
        if (model === 'reviewer') {
          reviewed = messages.map(message => message.content).join('\n');
          return { content: JSON.stringify({ verdict: 'NEEDS_REVISION', confidence: 0.9, findings: [] }) };
        }
        if (++writerCalls === 1) return { content: '', toolCalls: [
          { id: 'write', name: 'write_file', arguments: { path: 'calc.js', content: 'module.exports=42;' } },
          { id: 'check', name: 'run_shell_command', arguments: { command: 'PRIVATE_COMMAND' } },
        ] };
        return { content: '' };
      },
    }));
    expect(reviewed).toContain('write_file');
    expect(reviewed).toContain('run_shell_command');
    expect(reviewed).toContain('"exitCode":1');
    expect(reviewed).not.toMatch(/PRIVATE_/);
    expect(result.needsUserEscalation).toBe(true);
    expect(readFileSync(join(root, 'calc.js'), 'utf8')).toBe('module.exports=42;');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
