import { expect, it } from 'vitest';
import { SimpleModelRegistry } from '@chimera/providers';
import { EventStream } from '../../event-stream.js';
import { TrioExecutor } from '../trio-executor.js';

it.each([
  ['Plan a safe calculator refactor.', true],
  ['Plan a safe calculator refactor.', false],
  ['What is recursion?', true],
  ['What is recursion?', false],
] as const)('supplies the strict reviewer contract for %s (parallel=%s)', async (task, parallel) => {
  let prompt = '';
  const executor = new TrioExecutor({ eventStream: new EventStream(), registry: new SimpleModelRegistry(), readOnly: true });
  const result = await executor.executeWithAnalysis(task, {
    writer: 'writer', reviewer: 'reviewer', challenger: 'challenger', parallel,
  }, model => ({ complete: async messages => {
    if (model === 'reviewer') {
      prompt = messages.map(message => message.content).join('\n');
      const supplied = ['"verdict"', '"PASS"', '"FAIL"', '"NEEDS_REVISION"', '"confidence"', '"findings"'].every(field => prompt.includes(field));
      return { content: supplied ? JSON.stringify({ verdict: 'PASS', confidence: 0.9, findings: [] }) : 'Looks good.' };
    }
    return { content: model === 'challenger' ? '{"challenges":[],"alternatives":[]}' : 'A bounded answer.' };
  } }));
  expect(prompt).toContain('"confidence"');
  expect(prompt).toContain('"findings"');
  expect(result.stages.find(stage => stage.role === 'reviewer')?.verdict).toBe('PASS');
  expect(result.needsUserEscalation).toBe(false);
});
