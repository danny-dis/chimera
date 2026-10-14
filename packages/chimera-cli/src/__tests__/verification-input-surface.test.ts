import { afterEach, expect, it, vi } from 'vitest';
import { CliRouter } from '../cli-router.js';
import { CostTracker, EventStream } from '@chimera/core';
import { createToolContext } from '../tool-context.js';
import { runWorkflowInContext } from '../workflow-runtime.js';
afterEach(() => vi.restoreAllMocks());

it.each(['code', 'debug', 'oal', 'parallel'])('%s accepts repeatable caller-owned input declarations', async command => {
  const router = new CliRouter();
  const run = vi.spyOn(router as any, 'run').mockResolvedValue(undefined);
  await (router as any).program.parseAsync(['node', 'chimera', command, 'Implement feature', '--verify-input', 'verify.cjs', '--verify-input', 'fixture.json']);
  expect(run).toHaveBeenCalledWith(expect.any(String), 'Implement feature', expect.any(String), [], expect.objectContaining({ verifyInput: ['verify.cjs', 'fixture.json'] }));
});

it('forwards protected workflow input files to canonical execution', async () => {
  const eventStream = new EventStream();
  const execute = vi.fn(async () => ({ status: 'done', output: 'checked' }));
  await runWorkflowInContext({ name: 'protected', steps: [{ id: 'write', kind: 'llm', config: { role: 'writer', toolLoop: true, prompt: 'Create source.js' } }] },
    { writer: { getModel: () => ({ provider: 'openai-compatible' }) } as any, ...createToolContext('code'), orchestrator: { execute } as any },
    { workspaceRoot: process.cwd(), sessionId: 'protected', mode: 'code', eventStream, costTracker: new CostTracker(eventStream), inputs: { verificationInputs: ['verify.cjs'] } });
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ verificationInputs: ['verify.cjs'] }));
});
