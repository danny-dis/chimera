import { expect, it } from 'vitest';
import { parseReviewVerdict } from '../review-verdict.js';
import { TrioExecutor } from '../trio-executor.js';
import { EventStream } from '../../event-stream.js';
import { SimpleModelRegistry } from '@chimera/providers';

const fenced = (value: unknown) => '```json\n' + JSON.stringify(value) + '\n```';
const pass = { verdict: 'PASS', confidence: 1, findings: [] };

it('accepts the exact fenced JSON envelope observed in the live trio review', () => {
  expect(parseReviewVerdict(fenced(pass))).toEqual({ ...pass, malformed: false });
});

it.each([
  { verdict: 'pass', findings: [] },
  { ...pass, confidence: '1' },
  { ...pass, findings: [{}] },
])('still rejects malformed records inside fences: %j', value => {
  expect(parseReviewVerdict(fenced(value))).toMatchObject({ verdict: 'NEEDS_REVISION', malformed: true });
});

it.each([
  'Review: ' + fenced(pass),
  fenced(pass) + '\nPASS',
  fenced(pass) + '\n' + fenced(pass),
  '```javascript\n' + JSON.stringify(pass) + '\n```',
])('does not extract an approving fragment from mixed content', content => {
  expect(parseReviewVerdict(content)).toMatchObject({ verdict: 'NEEDS_REVISION', malformed: true });
});

it.each(['PASS', 'FAIL', 'NEEDS_REVISION'])('preserves a fenced %s through trio synthesis', async verdict => {
  const executor = new TrioExecutor({ eventStream: new EventStream(), registry: new SimpleModelRegistry(), readOnly: true });
  const result = await executor.executeWithAnalysis('Plan a bounded calculator refactor.', { writer: 'writer', reviewer: 'reviewer' },
    model => ({ complete: async () => ({ content: model === 'reviewer' ? fenced({ ...pass, verdict }) : 'A bounded implementation plan.' }) }));
  expect(result.stages.find(stage => stage.role === 'reviewer')?.verdict).toBe(verdict);
  expect(result.needsUserEscalation).toBe(verdict !== 'PASS');
});
