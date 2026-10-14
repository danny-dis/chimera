import { expect, it } from 'vitest';
import { EventStream, SessionOrchestrator } from '@chimera/core';
import { createToolContext } from '../tool-context.js';
import { runWorkflowInContext } from '../workflow-runtime.js';

it('records canonical workflow provider usage exactly once', async () => {
  const eventStream = new EventStream();
  const tools = createToolContext('ask');
  const orchestrator = new SessionOrchestrator(eventStream, {
    registry: tools.toolRegistry as any, executor: tools.toolExecutor as any,
  }, process.cwd());
  const writer = {
    getModel: () => ({ provider: 'openai-compatible', id: 'writer', contextWindow: 4096 }),
    getModelId: () => 'writer',
    getPricing: () => ({ inputPerMillion: 1_000_000, outputPerMillion: 0 }),
    complete: async () => ({ content: 'Hello', usage: { inputTokens: 1, outputTokens: 0 } }),
  };
  try {
    const result = await runWorkflowInContext({ name: 'canonical-accounting', steps: [{ id: 'answer', kind: 'llm',
      config: { role: 'writer', prompt: 'Hello', withTools: true, preset: 'solo' } }] },
      { writer: writer as any, ...tools, orchestrator }, {
        workspaceRoot: process.cwd(), sessionId: 'accounting', mode: 'ask', eventStream,
        costTracker: orchestrator.getCostTracker(),
      });
    expect(result.status).toBe('success');
    expect(orchestrator.getCostTracker().getTotalCost()).toBe(1);
  } finally { orchestrator.dispose(); }
});
