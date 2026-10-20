import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleModelRegistry } from '@chimera/providers';
import { EventStream } from '../../../event-stream.js';
import { DeliberationEngine } from '../engine.js';

it.each([1, 6])('forwards %i tool follow-ups to Hive workers', async maxToolRounds => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-hive-budget-'));
  let workerCalls = 0;
  const execute = vi.fn(async () => ({ success: true, data: { content: 'inspected source' }, duration: 0 }));
  try {
    const engine = new DeliberationEngine({ eventStream: new EventStream(), registry: new SimpleModelRegistry(),
      mode: 'plan', workspaceRoot: root, toolExecutor: { execute },
      toolRegistry: { has: name => name === 'read_file', getAll: () => [{ name: 'read_file',
        description: 'Read source', permissionLevel: 'read', parameters: z.object({ path: z.string() }) }] } as any,
      providerFactory: model => ({ complete: async () => model === 'judge' ? {
        content: JSON.stringify({ strategy: 'sequential', rationale: 'One inspection task.', subTasks: [{
          id: 'inspect', description: 'Inspect calc.js and return a bounded plan.', dependencies: [], type: 'analysis',
        }] }),
      } : {
        content: 'A bounded inspection plan.',
        toolCalls: [{ id: `read-${++workerCalls}`, name: 'read_file', arguments: { path: 'calc.js' } }],
      } }),
    });
    const result = await engine.run({ mode: 'hive', task: 'Plan a bounded calculator refactor after inspection.',
      models: ['worker'], mergeModel: 'judge', maxToolRounds });
    expect(result.degraded).toBe(false);
    expect(workerCalls).toBe(maxToolRounds + 1);
    expect(execute).toHaveBeenCalledTimes(maxToolRounds + 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
