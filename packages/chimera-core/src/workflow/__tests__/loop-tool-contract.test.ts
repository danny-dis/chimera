import { expect, it, vi } from 'vitest';
import { runWorkflow } from '../runner.js';

const definition = (withTools = false) => ({ name: 'loop-tools', steps: [{ id: 'loop', kind: 'loop' as const,
  config: { role: 'writer', prompt: 'work', until: 'COMPLETE', max_iterations: 1, withTools, preset: 'solo' } }] });
const writer = { complete: vi.fn(async () => ({ content: 'COMPLETE' })) };

it('refuses completion while a loop response contains unexecuted tool calls', async () => {
  const result = await runWorkflow(definition(), { handlers: { providers: { writer },
    llmCaller: async () => ({ content: 'COMPLETE', toolCalls: [{ id: 'unexecuted', name: 'write_file', arguments: { path: 'artifact.txt', content: 'not written' } }] }) } });
  expect(result.status).toBe('error');
  expect(result.error).toMatch(/unexecuted tool calls/i);
});

it('forwards loop tool intent and preset to the canonical caller', async () => {
  const llmCaller = vi.fn(async () => ({ content: 'COMPLETE' }));
  const result = await runWorkflow(definition(true), { handlers: { providers: { writer }, llmCaller } });
  expect(result.status).toBe('success');
  expect(llmCaller).toHaveBeenCalledWith(expect.objectContaining({ withTools: true, preset: 'solo' }));
});

it('refuses tool-enabled loops without an execution-aware caller', async () => {
  writer.complete.mockClear();
  const result = await runWorkflow(definition(true), { handlers: { providers: { writer } } });
  expect(result.status).toBe('error');
  expect(writer.complete).not.toHaveBeenCalled();
});
