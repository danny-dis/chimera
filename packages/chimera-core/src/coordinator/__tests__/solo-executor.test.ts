/**
 * Smoke test for `SoloExecutor`.
 *
 * Verifies that Solo mode supports both direct calls and the new
 * sequential self-verification (selfVerify=true) behavior.
 */

import { describe, it, expect, vi } from 'vitest';
import { SoloExecutor } from '../solo-executor.js';
import { ModelRegistry } from '../../../../chimera-providers/src/model-registry.js';
import { CostTracker } from '../../cost-tracker.js';
import { EventStream } from '../../event-stream.js';
import type { LLMProvider } from '../../session-orchestrator.js';
import type { ModelEntry } from '../../../../chimera-providers/src/model-registry.js';

const MOCK_ID = 'mock/solo';
const FRONTIER_MODEL_ID = 'anthropic/claude-opus-4';

function makeMockProvider(
  responses: Array<{ match: string | RegExp; content: string; tokens?: number; throwOnMatch?: RegExp }>
): LLMProvider {
  return {
    complete: vi.fn().mockImplementation(async (messages: Array<{ role: string; content: string }>) => {
      const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
      for (const r of responses) {
        if (r.throwOnMatch && r.throwOnMatch.test(userMsg)) throw new Error('intentional');
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
    id: MOCK_ID,
    name: 'Mock Solo',
    provider: 'mock',
    contextWindow: 8192,
    maxOutputTokens: 1024,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
    capabilities: { toolCalling: false, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
    degradationThreshold: 0.5,
    tier: 'cheap',
  };
  if (!internal.models.has(MOCK_ID)) internal.models.set(MOCK_ID, { ...mockEntry });
  return reg;
}

describe('SoloExecutor — smoke', () => {
  it('runs a single model and returns its output (direct mode)', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const costTracker = new CostTracker(eventStream);
    const executor = new SoloExecutor({ eventStream, registry, costTracker });

    const factory = () => makeMockProvider([
      { match: /./, content: 'the answer is 42' },
    ]);

    const result = await executor.executeWithAnalysis(
      'What is the answer?',
      { model: MOCK_ID, temperature: 0, selfVerify: false },
      factory
    );

    expect(result.output).toBe('the answer is 42');
    expect(result.degraded).toBe(false);
    expect(result.analysis.confidence).toBe(0.8);
    expect(result.analysis.consensus).toEqual([]);

    // final_response event was emitted with agentCount 1
    const finalEvents = eventStream.getAll().filter((e) => (e as { type: string }).type === 'final_response');
    expect(finalEvents.length).toBe(1);
    expect((finalEvents[0] as { agentCount: number }).agentCount).toBe(1);
  });

  it('runs sequential self-verification (selfVerify=true)', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const executor = new SoloExecutor({ eventStream, registry });

    const factory = () => makeMockProvider([
      { match: /You are the writer/, content: 'draft content' },
      { match: /You are the reviewer/, content: 'verified content' },
    ]);

    const result = await executor.executeWithAnalysis(
      'What is the answer?',
      { model: MOCK_ID, temperature: 0, selfVerify: true },
      factory
    );

    expect(result.output).toContain('verified content');
    expect(result.degraded).toBe(false);
    expect(result.analysis.consensus).toEqual(['draft content']);

    // final_response event was emitted with agentCount 2
    const finalEvents = eventStream.getAll().filter((e) => (e as { type: string }).type === 'final_response');
    expect((finalEvents[0] as { agentCount: number }).agentCount).toBe(2);
  });

  it('handles provider throwing (degraded fallback)', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const executor = new SoloExecutor({ eventStream, registry });

    const factory = () => makeMockProvider([
      { match: /./, content: 'never reached', throwOnMatch: /./ },
    ]);

    const result = await executor.executeWithAnalysis(
      'task',
      { model: MOCK_ID, temperature: 0 },
      factory
    );

    expect(result.degraded).toBe(true);
    expect(result.degradationReason).toContain('intentional');
    expect(result.output).toBe('');
  });

  it('recursion guard blocks nested calls', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const executor = new SoloExecutor({ eventStream, registry });

    const factory = () => makeMockProvider([{ match: /./, content: 'ok' }]);

    const result = await executor.executeWithAnalysis(
      'task',
      { model: MOCK_ID, temperature: 0 },
      factory,
      { depth: 5 } // over the default maxDepth=1
    );

    expect(result.degraded).toBe(true);
    expect(result.degradationReason).toMatch(/recursion/);
  });

  it('config validation: missing model returns degraded', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const executor = new SoloExecutor({ eventStream, registry });

    const factory = () => makeMockProvider([{ match: /./, content: 'ok' }]);

    const result = await executor.executeWithAnalysis(
      'task',
      { model: '', temperature: 0 },
      factory
    );

    expect(result.degraded).toBe(true);
    expect(result.degradationReason).toMatch(/required/);
  });

  it('budget enforcement trips', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const costTracker = new CostTracker(eventStream);
    const executor = new SoloExecutor({ eventStream, registry, costTracker });

    const factory = (id: string) => {
      if (id === FRONTIER_MODEL_ID) return makeMockProvider([{ match: /./, content: 'content' }]);
      throw new Error(`unknown: ${id}`);
    };

    const result = await executor.executeWithAnalysis(
      'task',
      { model: FRONTIER_MODEL_ID, budgetUsd: 0.005, temperature: 0 },
      factory
    );

    expect(result.degraded).toBe(true);
    expect(result.degradationReason).toMatch(/budget/i);
  });
});
