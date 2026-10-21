import { expect, it, vi } from 'vitest';
import { SimpleModelRegistry } from '@chimera/providers';
import { EventStream } from '../../event-stream.js';
import { TrioExecutor } from '../trio-executor.js';

const review = (verdict: string) => JSON.stringify({ verdict, confidence: 0.9, findings: [] });
const config = { writer: 'writer', reviewer: 'reviewer', challenger: 'challenger' };

it.each(['FAIL', 'NEEDS_REVISION'])('retains %s through deterministic synthesis', async verdict => {
  const executor = new TrioExecutor({ eventStream: new EventStream(), registry: new SimpleModelRegistry() });
  const result = await executor.executeWithAnalysis('Explain a bounded approach.', config, model => ({
    complete: vi.fn(async () => ({ content: model === 'reviewer' ? review(verdict)
      : model === 'challenger' ? '{"challenges":[],"alternatives":[]}' : 'A bounded approach.' })),
  }));
  expect(result.stages.find(stage => stage.role === 'reviewer')?.verdict).toBe(verdict);
  expect(result.needsUserEscalation).toBe(true);
  expect(result.escalationReason).toContain(verdict);
});

it('retries a failed parallel review without discarding the writer draft', async () => {
  const calls: string[] = [];
  let attempts = 0;
  const executor = new TrioExecutor({ eventStream: new EventStream(), registry: new SimpleModelRegistry() });
  const result = await executor.executeWithAnalysis('Explain a bounded approach.', config, model => ({
    complete: vi.fn(async () => {
      calls.push(model);
      if (model === 'reviewer' && ++attempts === 1) throw new Error('Temporary review failure');
      return { content: model === 'reviewer' ? review('PASS')
        : model === 'challenger' ? '{"challenges":[],"alternatives":[]}' : 'A bounded approach.' };
    }),
  }));
  expect(attempts).toBe(2);
  expect(result.stages.filter(stage => stage.role === 'writer')).toHaveLength(1);
  expect(result.stages.find(stage => stage.role === 'reviewer')?.verdict).toBe('PASS');
  expect(result.needsUserEscalation).toBe(false);
  expect(calls.filter(model => model === 'writer')).toHaveLength(1);
});
