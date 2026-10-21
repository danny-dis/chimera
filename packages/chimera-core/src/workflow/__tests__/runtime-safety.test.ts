import { expect, it, vi } from 'vitest';
import { runWorkflow } from '../runner.js';
const writer = { complete: vi.fn(async () => ({ content: 'narration', usage: { inputTokens: 1, outputTokens: 1 } })) };

it('refuses tool-enabled steps without an execution-aware caller', async () => {
  const result = await runWorkflow({ name: 'tool-proof', steps: [{ id: 'write', kind: 'llm', config: { role: 'writer', withTools: true } }] }, { handlers: { providers: { writer } } });
  expect(result.status).toBe('error');
  expect(writer.complete).not.toHaveBeenCalled();
});

it.each([true, false])('forwards tool-loop intent to the execution caller: %s', async withTools => {
  const caller = vi.fn(async () => ({ content: 'executed', usage: { inputTokens: 1, outputTokens: 1 } }));
  const result = await runWorkflow({ name: 'caller-proof', steps: [{ id: 'write', kind: 'llm', config: { role: 'writer', withTools } }] }, { handlers: { providers: { writer }, llmCaller: caller } });
  expect(result.status).toBe('success');
  expect(caller).toHaveBeenCalledWith(expect.objectContaining({ withTools }));
});

it.each(['steps', 'tasks'])('required parallel %s cannot hide a branch failure', async kind => {
  const branch = kind === 'steps' ? { id: 'denied', kind: 'gate', config: {} } : { role: 'writer', prompt: 'fail' };
  const config = kind === 'steps' ? { branches: [branch] } : { tasks: [branch] };
  const result = await runWorkflow({ name: 'required-branches', steps: [{ id: 'parallel', kind: 'parallel', config }] } as any,
    { handlers: { llmCaller: async () => { throw new Error('denied'); } } });
  expect(result.status).toBe('error');
});

it('a workflow loop does not treat provider failure as successful completion', async () => {
  const result = await runWorkflow({ name: 'failed-loop', steps: [{ id: 'loop', kind: 'loop', config: { role: 'writer', prompt: 'work', max_iterations: 2, until: 'COMPLETE' } }] },
    { handlers: { llmCaller: async () => { throw new Error('unavailable'); } } });
  expect(result.status).toBe('error');
});

it('requires the caller command to pass even if model text says complete', async () => {
  const toolExecutor = vi.fn(async () => ({ success: true, data: { exitCode: 1 }, duration: 0 }));
  const complete = vi.fn(async () => ({ content: 'COMPLETE', usage: { inputTokens: 0, outputTokens: 0 } }));
  const result = await runWorkflow({ name: 'failed-command', steps: [{ id: 'loop', kind: 'loop', config: { prompt: 'work', until: 'COMPLETE', until_bash: 'node verify.cjs', max_iterations: 1, role: 'writer' } }] },
    { handlers: { providers: { writer: { complete } }, toolExecutor } });
  expect(complete).toHaveBeenCalledTimes(1);
  expect(toolExecutor).toHaveBeenCalledWith('run_shell_command', expect.objectContaining({ command: 'node verify.cjs' }));
  expect(result.status).toBe('error');
});

it('refuses a gate without an evaluator', async () => {
  const result = await runWorkflow({ name: 'gate-proof', steps: [{ id: 'gate', kind: 'gate', config: {} }] }, { handlers: { providers: { writer } } });
  expect(result.status).toBe('error');
  expect(result.error).toMatch(/evaluator/i);
});
