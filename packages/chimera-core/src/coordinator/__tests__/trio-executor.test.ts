/**
 * Smoke test for `TrioExecutor`.
 *
 * Verifies that the 4-stage quality gate (writer → reviewer → challenger
 * → synthesize) actually runs end-to-end with mock providers, producing
 * a structured 5-field analysis result. The deterministic synthesis path
 * is the default — no LLM synthesizer in this test.
 */

import { describe, it, expect, vi } from 'vitest';
import { TrioExecutor } from '../trio-executor.js';
import { ModelRegistry } from '../../../../chimera-providers/src/model-registry.js';
import { CostTracker } from '../../cost-tracker.js';
import { EventStream } from '../../event-stream.js';
import type { LLMProvider } from '../../session-orchestrator.js';
import type { ModelEntry } from '../../../../chimera-providers/src/model-registry.js';

const MOCK_IDS = {
  writer: 'mock/trio-writer',
  reviewer: 'mock/trio-reviewer',
  challenger: 'mock/trio-challenger',
} as const;

/** Real frontier model from the registry — used for cost lookups in benchmark. */
const FRONTIER_MODEL_ID = 'anthropic/claude-opus-4';

function makeMockProvider(
  responses: Array<{ match: string | RegExp; content: string; tokens?: number }>
): LLMProvider {
  return {
    complete: vi.fn().mockImplementation(async (messages: Array<{ role: string; content: string }>) => {
      const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
      for (const r of responses) {
        const match = typeof r.match === 'string' ? userMsg.includes(r.match) : r.match.test(userMsg);
        if (match) {
          return { content: r.content, usage: { inputTokens: 100, outputTokens: r.tokens ?? 50 } };
        }
      }
      return { content: 'fallback', usage: { inputTokens: 100, outputTokens: 10 } };
    }),
  } as unknown as LLMProvider;
}

function makeRegistry(): ModelRegistry {
  const reg = new ModelRegistry();
  const internal = reg as unknown as { models: Map<string, ModelEntry> };
  const mockEntry: ModelEntry = {
    id: 'mock/trio-writer',
    name: 'Mock Trio Writer',
    provider: 'mock',
    contextWindow: 8192,
    maxOutputTokens: 1024,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
    capabilities: { toolCalling: false, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
    degradationThreshold: 0.5,
    tier: 'cheap',
  };
  for (const id of Object.values(MOCK_IDS)) {
    if (!internal.models.has(id)) {
      internal.models.set(id, { ...mockEntry, id, name: id });
    }
  }
  return reg;
}

describe('TrioExecutor — smoke', () => {
  it('runs the 4-stage gate end-to-end with deterministic synthesis', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const costTracker = new CostTracker(eventStream);
    const executor = new TrioExecutor({ eventStream, registry, costTracker });

    const writerFactory = () => makeMockProvider([
      { match: 'You are the writer', content: 'Draft: the answer is 42.' },
    ]);
    const reviewerFactory = () => makeMockProvider([
      { match: 'You are the reviewer', content: JSON.stringify({
        verdict: 'pass',
        issues: [],
        commentary: 'looks good',
      }) },
    ]);
    const challengerFactory = () => makeMockProvider([
      { match: 'You are the challenger', content: JSON.stringify({
        challenges: ['what about edge cases?'],
        alternatives: ['consider also X'],
      }) },
    ]);

    const factory = (id: string) => {
      if (id === MOCK_IDS.writer) return writerFactory();
      if (id === MOCK_IDS.reviewer) return reviewerFactory();
      if (id === MOCK_IDS.challenger) return challengerFactory();
      throw new Error(`unknown model id: ${id}`);
    };

    const result = await executor.executeWithAnalysis(
      'What is the answer?',
      { writer: MOCK_IDS.writer, reviewer: MOCK_IDS.reviewer, challenger: MOCK_IDS.challenger, temperature: 0 },
      factory
    );

    // Output is the synthesized response. With 3 inputs and no detected
    // contradictions, the deterministic path picks the highest-confidence
    // input (the writer, confidence 0.8).
    expect(result.output).toBe('Draft: the answer is 42.');
    expect(result.degraded).toBe(false);
    expect(result.stages).toHaveLength(3);
    expect(result.stages[0].role).toBe('writer');
    expect(result.stages[1].role).toBe('reviewer');
    expect(result.stages[2].role).toBe('challenger');
    expect(result.stages[0].content).toBe('Draft: the answer is 42.');
    expect(result.stages[1].issues).toEqual([]);
    expect(result.stages[2].challenges).toEqual(['what about edge cases?']);
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.needsUserEscalation).toBe(false);

    // 5-field analysis shape
    expect(result.analysis.finalResponse).toBe('Draft: the answer is 42.');
    expect(result.analysis.consensus).toBeDefined();
    expect(result.analysis.conflicts).toBeDefined();
    expect(result.analysis.uniqueInsights).toBeDefined();
    expect(result.analysis.blindSpots).toBeDefined();
    expect(result.analysis.confidence).toBeGreaterThan(0);

    // Cost tracked
    expect(costTracker.getSpend(MOCK_IDS.writer)).toBe(0); // mock has 0 pricing
  });

  it('handles challenger as optional', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const executor = new TrioExecutor({ eventStream, registry });

    const writerFactory = () => makeMockProvider([{ match: 'You are the writer', content: 'draft' }]);
    const reviewerFactory = () => makeMockProvider([{ match: 'You are the reviewer', content: 'review' }]);

    const result = await executor.executeWithAnalysis(
      'task',
      { writer: MOCK_IDS.writer, reviewer: MOCK_IDS.reviewer, temperature: 0 },
      (id) => id === MOCK_IDS.writer ? writerFactory() : reviewerFactory()
    );

    expect(result.stages).toHaveLength(2);
    expect(result.stages.map((s) => s.role)).toEqual(['writer', 'reviewer']);
    expect(result.degraded).toBe(false);
  });

  it('recursion guard blocks nested calls', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const executor = new TrioExecutor({ eventStream, registry });

    const factory = () => makeMockProvider([{ match: /./, content: 'ok' }]);

    const result = await executor.executeWithAnalysis(
      'task',
      { writer: MOCK_IDS.writer, reviewer: MOCK_IDS.reviewer, temperature: 0 },
      factory,
      { depth: 5 } // over the default maxDepth=1
    );

    expect(result.degraded).toBe(true);
    expect(result.degradationReason).toMatch(/recursion/);
  });

  it('config validation: missing reviewer returns degraded', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const executor = new TrioExecutor({ eventStream, registry });

    const result = await executor.executeWithAnalysis(
      'task',
      { writer: MOCK_IDS.writer, reviewer: '', temperature: 0 },
      () => makeMockProvider([{ match: /./, content: 'ok' }])
    );

    expect(result.degraded).toBe(true);
    expect(result.degradationReason).toMatch(/required/);
  });
});

describe('TrioExecutor — budget enforcement', () => {
  it('returns degraded when budget is exceeded', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const costTracker = new CostTracker(eventStream);
    const executor = new TrioExecutor({ eventStream, registry, costTracker });

    // Use the real frontier model so cost is non-zero. 3 frontier calls
    // (100 input + 50 output tokens each) ≈ $0.0158. Budget $0.005 trips.
    const factory = (id: string) => {
      if (id === MOCK_IDS.challenger) return makeMockProvider([{ match: /./, content: 'challenge' }]);
      if (id === FRONTIER_MODEL_ID) return makeMockProvider([{ match: /./, content: 'content' }]);
      throw new Error(`unknown: ${id}`);
    };

    const result = await executor.executeWithAnalysis(
      'task',
      { writer: FRONTIER_MODEL_ID, reviewer: FRONTIER_MODEL_ID, challenger: MOCK_IDS.challenger,
        budgetUsd: 0.005, temperature: 0 },
      factory
    );

    expect(result.degraded).toBe(true);
    expect(result.degradationReason).toMatch(/budget/i);
  });
});
