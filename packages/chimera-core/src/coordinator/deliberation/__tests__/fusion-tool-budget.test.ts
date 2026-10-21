import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SimpleModelRegistry } from '@chimera/providers';
import { EventStream } from '../../../event-stream.js';
import { DeliberationEngine } from '../engine.js';

it.each([
  { maxToolRounds: 1, maxDepth: 10 },
  { maxToolRounds: 6, maxDepth: 1 },
])('honors $maxToolRounds tool follow-ups independently of depth $maxDepth', async ({ maxToolRounds, maxDepth }) => {
  let panelCalls = 0;
  const execute = vi.fn(async () => ({ success: true, data: { content: 'inspected source' }, duration: 0 }));
  const engine = new DeliberationEngine({
    eventStream: new EventStream(), registry: new SimpleModelRegistry(), mode: 'plan', workspaceRoot: process.cwd(),
    toolExecutor: { execute }, toolRegistry: { has: name => name === 'read_file', getAll: () => [{
      name: 'read_file', description: 'Read source', permissionLevel: 'read', parameters: z.object({ path: z.string() }),
    }] } as any,
    providerFactory: model => ({ complete: async () => model === 'judge' ? {
      content: JSON.stringify({ finalResponse: 'A bounded plan.', confidence: 0.9 }),
    } : {
      content: '', toolCalls: [{ id: `read-${++panelCalls}`, name: 'read_file', arguments: { path: 'calc.js' } }],
    } }),
  });
  const result = await engine.run({ mode: 'fusion', task: 'Plan a bounded refactor after reading calc.js.',
    analysisModels: ['panel'], judgeModel: 'judge', maxToolRounds, maxDepth });
  expect(result.degraded).toBe(false);
  expect(panelCalls).toBe(maxToolRounds + 1);
  expect(execute).toHaveBeenCalledTimes(maxToolRounds + 1);
});
