import { describe, expect, it, vi } from 'vitest';
import { SimpleModelRegistry } from '@chimera/providers';
import { DuoExecutor } from '../duo-executor.js';
import { EventStream } from '../../event-stream.js';
import { SessionOrchestrator, type LLMProvider } from '../../session-orchestrator.js';
import { DeliberationEngine } from '../deliberation/engine.js';

const task = 'Plan a Node.js CLI that prints hello; explain implementation and verification. Do not edit any files.';
const plan = 'Implementation plan: add a Node.js CLI entry point that prints hello. Verification: run node hello.js and assert stdout is hello and exit code is zero.';

function setup(writerContent: string, reviewerContent: string) {
  const writer = { complete: vi.fn<LLMProvider['complete']>(async () => ({ content: writerContent, usage: { inputTokens: 10, outputTokens: 20 } })) } satisfies LLMProvider;
  const reviewer = { complete: vi.fn<LLMProvider['complete']>(async () => ({ content: reviewerContent, usage: { inputTokens: 30, outputTokens: 40 } })) } satisfies LLMProvider;
  const executor = new DuoExecutor({ readOnly: true, eventStream: new EventStream(), registry: new SimpleModelRegistry() });
  return { executor, writer, reviewer, factory: (id: string) => id === 'writer' ? writer : reviewer };
}

describe('DuoExecutor empty response selection', () => {
  it('retains a useful writer plan when the reviewer returns empty content', async () => {
    const { executor, writer, reviewer, factory } = setup(plan, '');
    const result = await executor.executeWithAnalysis(task, { modelA: 'writer', modelB: 'reviewer' }, factory);

    expect(writer.complete).toHaveBeenCalledOnce();
    expect(reviewer.complete).toHaveBeenCalledOnce();
    expect(reviewer.complete.mock.calls[0][0][0].content).toContain(plan);
    expect(result.sources.map(source => source.content)).toEqual([plan, '']);
    expect(result.totalTokens).toBe(100);
    expect(result.output).toBe(plan);
    expect(result.analysis.finalResponse).toBe(plan);
    expect(result.analysis.consensus).toEqual([plan]);
    expect(result.analysis.confidence).toBe(0.8);
    expect(result.degraded).toBe(true);
    expect(result.degradationReason).toBe('reviewer failed');
    expect(result.needsUserEscalation).toBe(false);
  });

  it('preserves both-empty failure with zero confidence', async () => {
    const { executor, factory } = setup('', '');
    const result = await executor.executeWithAnalysis(task, { modelA: 'writer', modelB: 'reviewer' }, factory);

    expect(result.output).toBe('');
    expect(result.analysis.finalResponse).toBe('');
    expect(result.analysis.confidence).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.degradationReason).toBe('both models failed');
    expect(result.analysis.conflicts).toEqual(['both models failed']);
    expect(result.sources).toHaveLength(2);
  });

  it.each([plan, ''])('preserves needs_user through the plan caller for writer content %j', async writerContent => {
    const { factory } = setup(writerContent, '');
    const engine = new DeliberationEngine({ mode: 'plan', eventStream: new EventStream(), registry: new SimpleModelRegistry(), providerFactory: factory });
    const delib = await engine.run({ mode: 'duo', modelA: 'writer', modelB: 'reviewer', task });
    const orchestrator = new SessionOrchestrator();
    try {
      const result = await (orchestrator as any).deliberationToOrchestratorResult(delib, task, 'plan', null);
      expect(delib.degraded).toBe(true);
      expect(result.status).toBe('needs_user');
      expect(result.output).toContain(writerContent || 'both models failed');
      expect(result.output).toContain(writerContent ? 'reviewer failed' : 'both models failed');
      expect(delib.analysis.confidence).toBe(writerContent ? 0.8 : 0);
    } finally {
      orchestrator.dispose();
    }
  });
});
