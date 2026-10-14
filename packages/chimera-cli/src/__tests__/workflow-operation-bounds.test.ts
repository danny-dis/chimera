import { expect, it, vi } from 'vitest';
import { CostTracker, EventStream } from '@chimera/core';
import { createToolContext } from '../tool-context.js';
import { runWorkflowInContext } from '../workflow-runtime.js';
const definition = { name: 'bounded-analysis', steps: [{ id: 'analyze', kind: 'llm' as const, config: { role: 'writer', prompt: 'Analyze this task' } }] };
const metadata = { getModel: () => ({ provider: 'openai-compatible', id: 'writer' }), getModelId: () => 'writer', getPricing: () => ({ inputPerMillion: 1_000_000, outputPerMillion: 1_000_000 }) };
function options(signal?: AbortSignal) { const eventStream = new EventStream(); return { workspaceRoot: process.cwd(), mode: 'ask' as const, sessionId: 'bounds', eventStream, costTracker: new CostTracker(eventStream), signal }; }
it('rejects late workflow output from a provider that ignores abort', async () => {
  const controller = new AbortController();
  const complete = vi.fn(() => new Promise(() => {}));
  const run = runWorkflowInContext(definition, { writer: { ...metadata, complete } as any, ...createToolContext('ask') }, options(controller.signal));
  controller.abort();
  await expect(run).rejects.toThrow(/abort/i);
});
it('records actual usage and rejects over-budget workflow output', async () => {
  const config = options();
  const complete = vi.fn(async () => ({ content: 'not accepted', usage: { inputTokens: 11, outputTokens: 0 } }));
  const result = await runWorkflowInContext(definition, { writer: { ...metadata, complete } as any, ...createToolContext('ask') }, config);
  expect(result.status).toBe('error');
  expect(result.error).toMatch(/spending limit/i);
  expect(config.costTracker.getTotalCost()).toBe(11);
});
it('limits provider calls across workflow iterations', async () => {
  const complete = vi.fn(async () => ({ content: 'continue', usage: { inputTokens: 0, outputTokens: 0 } }));
  const result = await runWorkflowInContext({ name: 'call-budget', steps: [{ id: 'loop', kind: 'loop', config: { max_iterations: 30, until: 'COMPLETE', prompt: 'Continue', role: 'writer' } }] },
    { writer: { ...metadata, complete } as any, ...createToolContext('ask') }, options());
  expect(result.status).toBe('error');
  expect(complete).toHaveBeenCalledTimes(20);
});
