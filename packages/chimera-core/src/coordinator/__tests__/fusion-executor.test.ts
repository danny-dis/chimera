import { describe, it, expect, vi } from 'vitest';
import { FusionExecutor } from '../fusion-executor.js';
import { EventStream } from '../../event-stream.js';
import { CostTracker } from '../../cost-tracker.js';
import { ModelRegistry, type ModelEntry } from '../../../../chimera-providers/src/model-registry.js';
import type { LLMProvider } from '../../session-orchestrator.js';

function makeEntry(id: string, overrides?: Partial<ModelEntry>): ModelEntry {
  return {
    id,
    name: id,
    provider: 'mock',
    tier: 'cheap',
    deprecated: false,
    contextWindow: 8192,
    maxOutputTokens: 1024,
    pricing: { inputPerMillion: 1, outputPerMillion: 2 },
    capabilities: { toolCalling: false, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
    degradationThreshold: 0.5,
    ...overrides,
  } as ModelEntry;
}

function makeRegistryWithEntries(entries: ModelEntry[]): ModelRegistry {
  const registry = new ModelRegistry();
  const internal = registry as unknown as { models: Map<string, ModelEntry> };
  for (const entry of entries) internal.models.set(entry.id, entry);
  return registry;
}

describe('FusionExecutor', () => {
  it('executes a fusion task with a panel of 3 models and a judge', async () => {
    const eventStream = new EventStream();
    const registry = new ModelRegistry();
    const executor = new FusionExecutor({ eventStream, registry });

    const mockProvider: LLMProvider = {
      complete: vi.fn().mockImplementation(async (messages: any) => {
        const userMsg = messages[0].content;
        if (userMsg.includes('You are the judge')) {
          return { content: JSON.stringify({ finalResponse: 'Fused response', consensus: ['A'], conflicts: ['B'], uniqueInsights: ['C'], blindSpots: ['D'], confidence: 0.9 }) };
        }
        return { content: 'Mock response' };
      }),
    } as unknown as LLMProvider;

    const providerFactory = vi.fn().mockReturnValue(mockProvider);

    const config = {
      analysisModels: ['m1', 'm2', 'm3'],
      judgeModel: 'judge-m',
    };

    const output = await executor.execute('Research carbon taxes', config, providerFactory);

    expect(providerFactory).toHaveBeenCalledTimes(4); // 3 panels + 1 judge
    expect(output).toBe('Fused response');
  });

  it('degrades gracefully and emits fusion_budget_exceeded when budgetUsd is exceeded', async () => {
    const eventStream = new EventStream();
    const costTracker = new CostTracker(eventStream);
    // Expensive panel models so the panel calls alone blow through a tiny budget.
    const registry = makeRegistryWithEntries([
      makeEntry('panel-1', { pricing: { inputPerMillion: 1000, outputPerMillion: 1000 } }),
      makeEntry('judge-1', { tier: 'frontier', pricing: { inputPerMillion: 1000, outputPerMillion: 1000 } }),
    ]);
    const executor = new FusionExecutor({ eventStream, registry, costTracker });

    const provider: LLMProvider = {
      complete: vi.fn().mockResolvedValue({ content: 'response', usage: { inputTokens: 1000, outputTokens: 1000 } }),
    } as unknown as LLMProvider;
    const providerFactory = vi.fn().mockReturnValue(provider);

    const result = await executor.executeWithAnalysis(
      'Task',
      { analysisModels: ['panel-1'], judgeModel: 'judge-1', budgetUsd: 0.01 },
      providerFactory
    );

    expect(result.degraded).toBe(true);
    expect(result.degradationReason).toMatch(/budget/i);

    const events = eventStream.getAll().map((e) => (e as { type: string }).type);
    expect(events).toContain('fusion_budget_exceeded');
    // Judge should never have been reached once budget was blown by the panel.
    expect(providerFactory).not.toHaveBeenCalledWith('judge-1');
  });

  it('emits fusion_recursion_blocked and degrades when context.depth >= maxDepth', async () => {
    const eventStream = new EventStream();
    const registry = new ModelRegistry();
    const executor = new FusionExecutor({ eventStream, registry });

    const provider: LLMProvider = {
      complete: vi.fn().mockResolvedValue({ content: 'response' }),
    } as unknown as LLMProvider;
    const providerFactory = vi.fn().mockReturnValue(provider);

    const result = await executor.executeWithAnalysis(
      'Task',
      { analysisModels: ['m1'], judgeModel: 'judge-m', maxDepth: 1 },
      providerFactory,
      { depth: 1 }
    );

    expect(result.degraded).toBe(true);
    expect(result.degradationReason).toMatch(/recursion/i);
    const events = eventStream.getAll().map((e) => (e as { type: string }).type);
    expect(events).toContain('fusion_recursion_blocked');
    // No provider calls should have been made — the guard trips before panel dispatch.
    expect(providerFactory).not.toHaveBeenCalled();
  });

  it('fails over to the second judge in judgeFailover when the primary judge throws', async () => {
    const eventStream = new EventStream();
    const registry = new ModelRegistry();
    const executor = new FusionExecutor({ eventStream, registry });

    const panelProvider: LLMProvider = {
      complete: vi.fn().mockResolvedValue({ content: 'panel response' }),
    } as unknown as LLMProvider;
    const failingJudge: LLMProvider = {
      complete: vi.fn().mockRejectedValue(new Error('primary judge unavailable')),
    } as unknown as LLMProvider;
    const fallbackJudge: LLMProvider = {
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({ finalResponse: 'fallback answer', consensus: [], conflicts: [], uniqueInsights: [], blindSpots: [], confidence: 0.7 }),
      }),
    } as unknown as LLMProvider;

    const providerFactory = vi.fn().mockImplementation((modelId: string) => {
      if (modelId === 'judge-primary') return failingJudge;
      if (modelId === 'judge-fallback-2') return fallbackJudge;
      return panelProvider;
    });

    const result = await executor.executeWithAnalysis(
      'Task',
      { analysisModels: ['m1'], judgeModel: 'judge-primary', judgeFailover: ['judge-fallback-2'] },
      providerFactory
    );

    expect(result.output).toBe('fallback answer');
    expect(result.degraded).toBe(false);
    const events = eventStream.getAll().map((e) => (e as { type: string }).type);
    expect(events).toContain('fusion_fallback_judge');
    expect(providerFactory).toHaveBeenCalledWith('judge-fallback-2');
  });

  it('records spend via CostTracker for both panel and judge calls', async () => {
    const eventStream = new EventStream();
    const costTracker = new CostTracker(eventStream);
    const recordSpendSpy = vi.spyOn(costTracker, 'recordSpend');
    const registry = makeRegistryWithEntries([
      makeEntry('panel-1', { pricing: { inputPerMillion: 1, outputPerMillion: 2 } }),
      makeEntry('judge-1', { tier: 'frontier', pricing: { inputPerMillion: 5, outputPerMillion: 10 } }),
    ]);
    const executor = new FusionExecutor({ eventStream, registry, costTracker });

    const panelProvider: LLMProvider = {
      complete: vi.fn().mockResolvedValue({ content: 'panel response', usage: { inputTokens: 100, outputTokens: 100 } }),
    } as unknown as LLMProvider;
    const judgeProvider: LLMProvider = {
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({ finalResponse: 'judged answer', consensus: [], conflicts: [], uniqueInsights: [], blindSpots: [], confidence: 0.8 }),
        usage: { inputTokens: 200, outputTokens: 200 },
      }),
    } as unknown as LLMProvider;

    const providerFactory = vi.fn().mockImplementation((modelId: string) => (modelId === 'judge-1' ? judgeProvider : panelProvider));

    const result = await executor.executeWithAnalysis(
      'Task',
      { analysisModels: ['panel-1'], judgeModel: 'judge-1' },
      providerFactory
    );

    expect(result.degraded).toBe(false);
    expect(recordSpendSpy).toHaveBeenCalledWith('panel-1', expect.any(Number));
    expect(recordSpendSpy).toHaveBeenCalledWith('judge-1', expect.any(Number));
    expect(costTracker.getTotalCost()).toBeGreaterThan(0);
  });
});
