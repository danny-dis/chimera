import { expect, it } from 'vitest';
import { DeliberationEngine } from '../engine.js';
import type { DeliberationConfig } from '../types.js';
import { SimpleModelRegistry } from '@chimera/providers';
import { EventStream } from '../../../event-stream.js';

const task = 'Plan a refactor of the calculator exports without editing files.';
const context = 'PROJECT_CONTRACT_781: preserve the named calc export and return null for unknown operations.';
const configurations: DeliberationConfig[] = [
  { mode: 'solo', model: 'writer', task, eternalCoT: false },
  { mode: 'duo', modelA: 'writer', modelB: 'reviewer', task },
  { mode: 'trio', writer: 'writer', reviewer: 'reviewer', challenger: 'challenger', task },
  { mode: 'fusion', analysisModels: ['panel-a', 'panel-b'], judgeModel: 'judge', diversePerspectives: true, adversarialRound: true, task },
];

it.each(configurations)('forwards supplied context to every $mode model stage', async config => {
  const seen: Array<{ model: string; text: string }> = [];
  const events = new EventStream();
  const engine = new DeliberationEngine({
    eventStream: events, registry: new SimpleModelRegistry(), mode: 'plan',
    providerFactory: model => ({ complete: async messages => {
      seen.push({ model, text: messages.map(message => message.content).join('\n') });
      const content = model === 'judge' ? JSON.stringify({ finalResponse: 'Refactor safely, then run the existing tests.',
        consensus: [], conflicts: [], uniqueInsights: [], blindSpots: [], confidence: 0.9 })
        : config.mode === 'trio' && model === 'reviewer' ? JSON.stringify({ verdict: 'pass', issues: [], commentary: 'Valid plan.' })
        : model === 'challenger' ? JSON.stringify({ challenges: [], alternatives: [] })
        : 'Plan: retain named exports, then run the existing checks.';
      return { content };
    } }),
  });
  const result = await engine.run({ ...config, context });
  expect(result.degraded).toBe(false);
  expect(events.getAll()).toContainEqual({ type: 'deliberation_executed', mode: 'plan', preset: config.mode, resultMode: config.mode, degraded: false });
  const expected = config.mode === 'solo' ? ['writer', 'writer']
    : config.mode === 'duo' ? ['writer', 'reviewer']
    : config.mode === 'trio' ? ['writer', 'reviewer', 'challenger']
    : ['panel-a', 'panel-b', 'panel-a', 'panel-b', 'judge'];
  expect(seen.map(call => call.model)).toEqual(expected);
  for (const call of seen) expect(call.text, `${config.mode}/${call.model}`).toContain(context);
  expect(seen.every(call => call.text.includes(task))).toBe(true);
});
