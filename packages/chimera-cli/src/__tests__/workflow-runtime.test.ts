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

it('rejects offline mock providers rather than certifying a workflow run', async () => {
  const tools = createToolContext('code', { interactive: false });
  const eventStream = new EventStream();
  await expect(runWorkflowInContext(definition, { writer: { getModel: () => ({ provider: 'mock' }) } as any, toolExecutor: tools.toolExecutor }, {
    workspaceRoot: process.cwd(), mode: 'code', sessionId: 'mock-test', eventStream, costTracker: new CostTracker(eventStream),
  })).rejects.toThrow('real providers');
});
