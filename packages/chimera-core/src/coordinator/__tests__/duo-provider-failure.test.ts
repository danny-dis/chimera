import { expect, it, vi } from 'vitest';
import { SimpleModelRegistry } from '@chimera/providers';
import { DuoExecutor } from '../duo-executor.js';
import { DeliberationEngine } from '../deliberation/engine.js';
import { EventStream } from '../../event-stream.js';
import { SessionOrchestrator, type LLMProvider } from '../../session-orchestrator.js';

const task = 'Plan a Node CLI; explain implementation and verification without editing files.';
const plan = 'Implementation: create a Node CLI entry point. Verification: run node hello.js and assert stdout and exit status.';

it('retains the completed draft and needs_user when the reviewer throws', async () => {
  const writer: LLMProvider = { complete: vi.fn(async () => ({ content: plan, usage: { inputTokens: 10, outputTokens: 20 } })) };
  const reviewer: LLMProvider = { complete: vi.fn(async () => { throw new Error('reviewer timed out'); }) };
  const engine = new DeliberationEngine({ mode: 'plan', eventStream: new EventStream(), registry: new SimpleModelRegistry(), providerFactory: id => id === 'writer' ? writer : reviewer });
  const result = await engine.run({ mode: 'duo', modelA: 'writer', modelB: 'reviewer', task });
  expect(result.output).toBe(plan);
  expect(result.degraded).toBe(true);
  expect(result.degradationReason).toContain('reviewer timed out');
  expect(result.totalTokens).toBe(30);
  const orchestrator = new SessionOrchestrator();
  try {
    const outward = await (orchestrator as any).deliberationToOrchestratorResult(result, task, 'plan', null);
    expect(outward.status).toBe('needs_user');
    expect(outward.output).toContain(plan);
    expect(outward.output).toContain('reviewer timed out');
  } finally { orchestrator.dispose(); }
});

it('does not invent output when the writer throws', async () => {
  const complete = vi.fn<LLMProvider['complete']>(async () => { throw new Error('writer timed out'); });
  const executor = new DuoExecutor({ readOnly: true, eventStream: new EventStream(), registry: new SimpleModelRegistry() });
  const result = await executor.executeWithAnalysis(task, { modelA: 'writer', modelB: 'reviewer' }, () => ({ complete }));
  expect(result.output).toBe('');
  expect(result.analysis.confidence).toBe(0);
  expect(result.degradationReason).toContain('writer timed out');
  expect(complete).toHaveBeenCalledOnce();
});
