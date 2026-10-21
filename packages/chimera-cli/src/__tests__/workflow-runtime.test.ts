import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CostTracker, EventStream } from '@chimera/core';
import { createToolContext } from '../tool-context.js';
import { runWorkflowInContext } from '../workflow-runtime.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const definition = { name: 'write-proof', steps: [{ id: 'write', kind: 'tool' as const, config: { name: 'write_file', args: { path: 'proof.txt', content: 'real tool output' } } }] };
const writer = { getModel: () => ({ provider: 'openai-compatible' }), complete: vi.fn() } as any;

it('runs explicit workflow tool steps through the canonical tool executor', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chimera-workflow-owned-')); roots.push(root);
  const tools = createToolContext('code', { interactive: false });
  const eventStream = new EventStream();
  const result = await runWorkflowInContext(definition, { writer, toolExecutor: tools.toolExecutor }, {
    workspaceRoot: root, mode: 'code', sessionId: 'workflow-test', eventStream, costTracker: new CostTracker(eventStream),
  });
  expect(result.status).toBe('success');
  expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('real tool output');
});

it('does not bypass read-only tool policy for a workflow', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chimera-workflow-denied-')); roots.push(root);
  const tools = createToolContext('ask', { interactive: false });
  const eventStream = new EventStream();
  const result = await runWorkflowInContext(definition, { writer, toolExecutor: tools.toolExecutor }, {
    workspaceRoot: root, mode: 'ask', sessionId: 'denied-test', eventStream, costTracker: new CostTracker(eventStream),
  });
  expect(result.status).toBe('error');
  await expect(access(join(root, 'proof.txt'))).rejects.toThrow();
});

it.each(['done', 'needs_user'])('tool-enabled workflow uses canonical execution and honors %s', async status => {
  const root = await mkdtemp(join(tmpdir(), 'chimera-workflow-coding-')); roots.push(root);
  const tools = createToolContext('code', { interactive: false });
  const eventStream = new EventStream();
  const execute = vi.fn(async () => ({ status, output: 'canonical result' }));
  const result = await runWorkflowInContext({ name: 'coding', steps: [{ id: 'writer', kind: 'llm', config: { role: 'writer', toolLoop: true, preset: 'hive' } }] },
    { writer, toolExecutor: tools.toolExecutor, orchestrator: { execute } as any }, {
      workspaceRoot: root, mode: 'code', sessionId: 'coding-test', eventStream, costTracker: new CostTracker(eventStream),
      inputs: { task: 'Create sum.js', verificationCommands: ['node verify.cjs'], verificationOutputs: ['dist'] },
    });
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ task: 'Create sum.js', mode: 'code', preset: 'hive', verificationCommands: ['node verify.cjs'], verificationOutputs: ['dist'] }));
  expect(result.status).toBe(status === 'done' ? 'success' : 'error');
  if (status === 'done') expect((result.outputs.writer as any).usage).toBeUndefined();
});

it('rejects offline mock providers rather than certifying a workflow run', async () => {
  const tools = createToolContext('code', { interactive: false });
  const eventStream = new EventStream();
  await expect(runWorkflowInContext(definition, { writer: { getModel: () => ({ provider: 'mock' }) } as any, toolExecutor: tools.toolExecutor }, {
    workspaceRoot: process.cwd(), mode: 'code', sessionId: 'mock-test', eventStream, costTracker: new CostTracker(eventStream),
  })).rejects.toThrow('real providers');
});
