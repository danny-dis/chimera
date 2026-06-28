/**
 * Integration test for fusion mode — verifies the full path from
 * DeliberationEngine → FusionExecutor → result, including event
 * emission, cost tracking, and the registry-based config wiring.
 *
 * Run with:
 *   npx vitest run src/coordinator/__tests__/fusion-integration.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { DeliberationEngine } from '../deliberation/engine.js';
import { ModelRegistry, type ModelEntry } from '../../../../chimera-providers/src/model-registry.js';
import { CostTracker } from '../../cost-tracker.js';
import { EventStream } from '../../event-stream.js';
import type { LLMProvider } from '../../session-orchestrator.js';

// ── Helpers ──────────────────────────────────────────────────────────

function createMockProvider(response: string, usage = { inputTokens: 100, outputTokens: 200 }): LLMProvider {
  return {
    async complete(_messages, _options) {
      return { content: response, usage };
    },
  };
}

function createMockJudgeProvider(analysis: Record<string, unknown>): LLMProvider {
  return {
    async complete(_messages, _options) {
      return { content: JSON.stringify(analysis), usage: { inputTokens: 150, outputTokens: 300 } };
    },
  };
}

function makeMockEntry(id: string, overrides?: Partial<ModelEntry>): ModelEntry {
  return {
    id,
    name: id,
    provider: 'mock',
    tier: 'cheap',
    deprecated: false,
    contextWindow: 8192,
    maxOutputTokens: 1024,
    pricing: { inputPerMillion: 0.5, outputPerMillion: 1.5 },
    capabilities: { toolCalling: false, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
    degradationThreshold: 0.5,
    ...overrides,
  } as ModelEntry;
}

function createMockRegistry(entries: ModelEntry[]): ModelRegistry {
  const registry = new ModelRegistry();
  const internal = registry as unknown as { models: Map<string, ModelEntry> };
  for (const entry of entries) {
    internal.models.set(entry.id, entry);
  }
  return registry;
}

const MOCK_ANALYSIS = {
  thought: 'The panel responses show strong agreement on core approach.',
  finalResponse: 'Based on multi-model analysis, the optimal approach is X.',
  consensus: ['Use TypeScript', 'Follow existing patterns'],
  conflicts: ['Error handling strategy differs'],
  uniqueInsights: ['Panel A suggested caching'],
  blindSpots: ['No testing strategy discussed'],
  confidence: 0.85,
};

const PANEL_A = makeMockEntry('panel-a', { provider: 'openai', pricing: { inputPerMillion: 0.5, outputPerMillion: 1.5 } });
const PANEL_B = makeMockEntry('panel-b', { provider: 'anthropic', tier: 'mid', pricing: { inputPerMillion: 3, outputPerMillion: 15 } });
const PANEL_C = makeMockEntry('panel-c', { provider: 'google', pricing: { inputPerMillion: 0.25, outputPerMillion: 0.5 } });
const JUDGE = makeMockEntry('judge-1', { provider: 'anthropic', tier: 'frontier', pricing: { inputPerMillion: 15, outputPerMillion: 75 } });

// ── Tests ────────────────────────────────────────────────────────────

describe('Fusion integration — DeliberationEngine → FusionExecutor', () => {
  it('runs fusion via DeliberationEngine and returns structured analysis', async () => {
    const eventStream = new EventStream();
    const costTracker = new CostTracker(eventStream);
    const registry = createMockRegistry([PANEL_A, PANEL_B, PANEL_C, JUDGE]);

    const judgeProvider = createMockJudgeProvider(MOCK_ANALYSIS);
    const panelProvider = createMockProvider('Panel response content');

    const providerFactory = vi.fn().mockImplementation((modelId: string) => {
      if (modelId === 'judge-1') return judgeProvider;
      return panelProvider;
    });

    const engine = new DeliberationEngine({ eventStream, registry, costTracker, providerFactory });

    const result = await engine.run({
      mode: 'fusion',
      analysisModels: ['panel-a', 'panel-b', 'panel-c'],
      judgeModel: 'judge-1',
      task: 'Evaluate the caching strategy for this API',
      temperature: 0.7,
    });

    expect(result.mode).toBe('fusion');
    expect(result.degraded).toBe(false);
    expect(result.output).toBe('Based on multi-model analysis, the optimal approach is X.');
    expect(result.analysis.consensus).toEqual(['Use TypeScript', 'Follow existing patterns']);
    expect(result.analysis.conflicts).toEqual(['Error handling strategy differs']);
    expect(result.analysis.uniqueInsights).toEqual(['Panel A suggested caching']);
    expect(result.analysis.blindSpots).toEqual(['No testing strategy discussed']);
    expect(result.analysis.confidence).toBe(0.85);
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.totalCostUsd).toBeGreaterThan(0);
  });

  it('emits fusion_started and fusion_completed events', async () => {
    const eventStream = new EventStream();
    const registry = createMockRegistry([PANEL_A, PANEL_B, JUDGE]);
    const panelProvider = createMockProvider('Response');
    const judgeProvider = createMockJudgeProvider(MOCK_ANALYSIS);

    const providerFactory = vi.fn().mockImplementation((modelId: string) => {
      if (modelId === 'judge-1') return judgeProvider;
      return panelProvider;
    });

    const engine = new DeliberationEngine({ eventStream, registry, providerFactory });

    await engine.run({
      mode: 'fusion',
      analysisModels: ['panel-a', 'panel-b'],
      judgeModel: 'judge-1',
      task: 'Test task',
    });

    const events = eventStream.getAll();
    const types = events.map((e) => (e as { type: string }).type);

    expect(types).toContain('fusion_started');
    expect(types).toContain('fusion_completed');
  });

  it('records spend for panel and judge calls', async () => {
    const eventStream = new EventStream();
    const costTracker = new CostTracker(eventStream);
    const registry = createMockRegistry([PANEL_A, PANEL_B, JUDGE]);
    const panelProvider = createMockProvider('Response', { inputTokens: 1000, outputTokens: 2000 });
    const judgeProvider = createMockJudgeProvider(MOCK_ANALYSIS);

    const providerFactory = vi.fn().mockImplementation((modelId: string) => {
      if (modelId === 'judge-1') return judgeProvider;
      return panelProvider;
    });

    const engine = new DeliberationEngine({ eventStream, registry, costTracker, providerFactory });

    await engine.run({
      mode: 'fusion',
      analysisModels: ['panel-a', 'panel-b'],
      judgeModel: 'judge-1',
      task: 'Test cost tracking',
    });

    const totalCost = costTracker.getTotalCost();
    expect(totalCost).toBeGreaterThan(0);
  });

  it('degrades gracefully when all panel models fail', async () => {
    const eventStream = new EventStream();
    const registry = createMockRegistry([PANEL_A, PANEL_B, JUDGE]);

    const failProvider: LLMProvider = {
      async complete() {
        throw new Error('Provider unavailable');
      },
    };

    const providerFactory = vi.fn().mockReturnValue(failProvider);

    const engine = new DeliberationEngine({ eventStream, registry, providerFactory });

    const result = await engine.run({
      mode: 'fusion',
      analysisModels: ['panel-a', 'panel-b'],
      judgeModel: 'judge-1',
      task: 'Test degradation',
    });

    expect(result.degraded).toBe(true);
    expect(result.output).toBe('');
  });

  it('degrades when recursion depth exceeded', async () => {
    const eventStream = new EventStream();
    const registry = createMockRegistry([PANEL_A, JUDGE]);
    const panelProvider = createMockProvider('Response');
    const judgeProvider = createMockJudgeProvider(MOCK_ANALYSIS);

    const providerFactory = vi.fn().mockImplementation((modelId: string) => {
      if (modelId === 'judge-1') return judgeProvider;
      return panelProvider;
    });

    const engine = new DeliberationEngine({ eventStream, registry, providerFactory });

    const result = await engine.run({
      mode: 'fusion',
      analysisModels: ['panel-a'],
      judgeModel: 'judge-1',
      task: 'Test recursion',
      maxDepth: 0,
    });

    expect(result.degraded).toBe(true);
    expect(result.degradationReason).toContain('recursion');
  });
});
