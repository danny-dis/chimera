import { expect, it } from 'vitest';
import { SimpleModelRegistry } from '@chimera/providers';
import { EventStream } from '../../../event-stream.js';
import { DeliberationEngine } from '../engine.js';

const analysis = (text: string) => JSON.stringify({ finalResponse: text, confidence: 0.9,
  consensus: [], conflicts: [], uniqueInsights: [], blindSpots: [] });

it('runs top-level fusion below its configured maximum recursion depth', async () => {
  const engine = new DeliberationEngine({ eventStream: new EventStream(), registry: new SimpleModelRegistry(),
    mode: 'plan', providerFactory: model => ({ complete: async () => ({
      content: model === 'judge' ? analysis('A bounded plan.') : 'Independent analysis.',
      usage: { inputTokens: 1, outputTokens: 1 },
    }) }),
  });
  const result = await engine.run({ mode: 'fusion', task: 'Plan a bounded refactor of calc.js.',
    analysisModels: ['first', 'second'], judgeModel: 'judge', maxDepth: 2 });
  expect(result.degraded).toBe(false);
  expect(result.output).toBe('A bounded plan.');
});

it('forwards the configured fusion judge failover', async () => {
  const seen: string[] = [];
  const engine = new DeliberationEngine({ eventStream: new EventStream(), registry: new SimpleModelRegistry(),
    mode: 'plan', providerFactory: model => {
      seen.push(model);
      if (model === 'unavailable-judge') throw new Error('Judge unavailable');
      return { complete: async () => ({ content: model === 'backup-judge'
        ? analysis('Configured backup judge.') : analysis('Other answer.'), usage: { inputTokens: 1, outputTokens: 1 } }) };
    },
  });
  const result = await engine.run({ mode: 'fusion', task: 'Plan a bounded refactor of calc.js.',
    analysisModels: ['first', 'second'], judgeModel: 'unavailable-judge', judgeFailover: ['backup-judge'] });
  expect(seen).toContain('backup-judge');
  expect(result.output).toBe('Configured backup judge.');
});

it('still blocks fusion at the inherited recursion limit', async () => {
  let calls = 0;
  const engine = new DeliberationEngine({ eventStream: new EventStream(), registry: new SimpleModelRegistry(),
    mode: 'plan', context: { depth: 2 }, providerFactory: () => {
      calls++;
      throw new Error('Provider must not run at the depth limit');
    },
  });
  const result = await engine.run({ mode: 'fusion', task: 'Plan a bounded refactor of calc.js.',
    analysisModels: ['first', 'second'], judgeModel: 'judge', maxDepth: 2 });
  expect(result.degraded).toBe(true);
  expect(result.degradationReason).toBe('recursion limit reached');
  expect(calls).toBe(0);
});
