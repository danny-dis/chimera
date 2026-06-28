/**
 * Smoke tests for the unified `DeliberationEngine`.
 *
 * One test per mode (6 tests total). Each verifies that the engine
 * dispatches to the correct underlying executor and normalizes the
 * result to the unified 5-field `DeliberationResult` shape.
 *
 * Mirrors the pattern from `trio-executor.test.ts`: mock providers,
 * mock registry, real EventStream + CostTracker, real executor under
 * the engine facade.
 */

import { describe, it, expect, vi } from 'vitest';
import { DeliberationEngine, presets } from '../engine.js';
import { ModelRegistry } from '../../../../../chimera-providers/src/model-registry.js';
import { CostTracker } from '../../../cost-tracker.js';
import { EventStream } from '../../../event-stream.js';
import type { LLMProvider } from '../../../session-orchestrator.js';
import type { ModelEntry } from '../../../../../chimera-providers/src/model-registry.js';

const MOCK_IDS = {
  solo: 'mock/engine-solo',
  duoA: 'mock/engine-duo-a',
  duoB: 'mock/engine-duo-b',
  writer: 'mock/engine-trio-writer',
  reviewer: 'mock/engine-trio-reviewer',
  challenger: 'mock/engine-trio-challenger',
  hive: 'mock/engine-hive',
} as const;

function makeMockProvider(
  responses: Array<{ match: string | RegExp; content: string; tokens?: number }>,
): LLMProvider {
  return {
    complete: vi
      .fn()
      .mockImplementation(
        async (messages: Array<{ role: string; content: string }>) => {
          // Search ALL messages (system + user) for matches
          const allContent = messages.map((m) => m.content).join('\n');
          for (const r of responses) {
            const match =
              typeof r.match === 'string'
                ? allContent.includes(r.match)
                : r.match.test(allContent);
            if (match) {
              return {
                content: r.content,
                usage: { inputTokens: 100, outputTokens: r.tokens ?? 50 },
              };
            }
          }
          return { content: 'fallback', usage: { inputTokens: 100, outputTokens: 10 } };
        },
      ),
  } as unknown as LLMProvider;
}

function makeRegistry(): ModelRegistry {
  const reg = new ModelRegistry();
  const internal = reg as unknown as { models: Map<string, ModelEntry> };
  const mockEntry: ModelEntry = {
    id: MOCK_IDS.solo,
    name: 'Mock Engine',
    provider: 'mock',
    contextWindow: 8192,
    maxOutputTokens: 1024,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
    capabilities: {
      toolCalling: false,
      structuredOutput: true,
      vision: false,
      reasoning: false,
      parallelToolCalls: false,
    },
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

function makeFactory(
  providers: Record<string, LLMProvider>,
): (modelId: string) => LLMProvider {
  return (modelId: string) => {
    const p = providers[modelId];
    if (!p) throw new Error(`unknown model id in test factory: ${modelId}`);
    return p;
  };
}

describe('DeliberationEngine — solo preset', () => {
  it('dispatches to SoloExecutor and returns normalized 5-field result', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const costTracker = new CostTracker(eventStream);
    const engine = new DeliberationEngine({
      eventStream,
      registry,
      costTracker,
      providerFactory: makeFactory({
        [MOCK_IDS.solo]: makeMockProvider([
          { match: /strategic thinker/, content: 'Thinking: the answer is 42' },
          { match: /You are the writer/, content: 'the answer is 42' },
          { match: /You are the reviewer/, content: 'the answer is 42' },
        ]),
      }),
    });

    const result = await engine.run(
      presets.solo(MOCK_IDS.solo, 'What is the answer?'),
    );

    expect(result.mode).toBe('solo');
    expect(result.output).toBe('the answer is 42');
    expect(result.analysis.finalResponse).toBe('the answer is 42');
    expect(Array.isArray(result.analysis.consensus)).toBe(true);
    expect(Array.isArray(result.analysis.conflicts)).toBe(true);
    expect(Array.isArray(result.analysis.uniqueInsights)).toBe(true);
    expect(Array.isArray(result.analysis.blindSpots)).toBe(true);
    expect(typeof result.analysis.confidence).toBe('number');
    expect(result.degraded).toBe(false);
    expect(result.totalTokens).toBeGreaterThan(0);
  });
});

describe('DeliberationEngine — duo preset', () => {
  it('dispatches to DuoExecutor and returns normalized 5-field result', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const engine = new DeliberationEngine({
      eventStream,
      registry,
      providerFactory: makeFactory({
        [MOCK_IDS.duoA]: makeMockProvider([
          { match: 'You are a writer', content: 'writer: 42 from 7*6' },
        ]),
        [MOCK_IDS.duoB]: makeMockProvider([
          { match: 'You are a reviewer', content: 'reviewer: 42 from 6*7' },
        ]),
      }),
    });

    const result = await engine.run(
      presets.duo(MOCK_IDS.duoA, MOCK_IDS.duoB, 'What is the answer?'),
    );

    expect(result.mode).toBe('duo');
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.analysis.finalResponse).toBe(result.output);
    expect(Array.isArray(result.analysis.consensus)).toBe(true);
    expect(Array.isArray(result.analysis.conflicts)).toBe(true);
    expect(Array.isArray(result.analysis.uniqueInsights)).toBe(true);
    expect(Array.isArray(result.analysis.blindSpots)).toBe(true);
    expect(typeof result.analysis.confidence).toBe('number');
    expect(result.totalTokens).toBeGreaterThan(0);
  });
});

describe('DeliberationEngine — trio preset', () => {
  it('dispatches to TrioExecutor and returns normalized 5-field result', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const engine = new DeliberationEngine({
      eventStream,
      registry,
      providerFactory: makeFactory({
        [MOCK_IDS.writer]: makeMockProvider([
          { match: 'You are a code writer', content: 'draft answer' },
        ]),
        [MOCK_IDS.reviewer]: makeMockProvider([
          {
            match: 'You are a code reviewer',
            content: JSON.stringify({ verdict: 'pass', issues: [], commentary: 'ok' }),
          },
        ]),
        [MOCK_IDS.challenger]: makeMockProvider([
          {
            match: 'You are the challenger',
            content: JSON.stringify({ challenges: ['edge case?'], alternatives: [] }),
          },
        ]),
      }),
    });

    const result = await engine.run(
      presets.trio(
        MOCK_IDS.writer,
        MOCK_IDS.reviewer,
        'What is the answer?',
        MOCK_IDS.challenger,
      ),
    );

    expect(result.mode).toBe('trio');
    expect(result.output).toBe('draft answer');
    expect(result.analysis.finalResponse).toBe('draft answer');
    expect(Array.isArray(result.analysis.consensus)).toBe(true);
    expect(Array.isArray(result.analysis.conflicts)).toBe(true);
    expect(Array.isArray(result.analysis.uniqueInsights)).toBe(true);
    expect(Array.isArray(result.analysis.blindSpots)).toBe(true);
    expect(result.analysis.confidence).toBeGreaterThan(0);
    expect(result.degraded).toBe(false);
  });
});

describe('DeliberationEngine — fusion preset', () => {
  it('dispatches to FusionExecutor and returns normalized 5-field result', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const costTracker = new CostTracker(eventStream);
    const engine = new DeliberationEngine({
      eventStream,
      registry,
      costTracker,
      providerFactory: makeFactory({
        [MOCK_IDS.solo]: makeMockProvider([
          {
            match: /./,
            content: JSON.stringify({
              thought: 'reasoning',
              finalResponse: 'fusion result',
              consensus: ['agreed point'],
              conflicts: [],
              uniqueInsights: [],
              blindSpots: [],
              confidence: 0.85,
            }),
          },
        ]),
      }),
    });

    const result = await engine.run(
      presets.fusion([MOCK_IDS.solo], MOCK_IDS.solo, 'task'),
    );

    expect(result.mode).toBe('fusion');
    expect(result.output).toBe('fusion result');
    expect(result.analysis.finalResponse).toBe('fusion result');
    expect(result.degraded).toBe(false);
    expect(result.totalTokens).toBeGreaterThan(0);
  });
});

describe('DeliberationEngine — hive preset', () => {
  it('decomposes task, runs subtasks in parallel, and merges results', async () => {
    // Create a provider that handles all three hive stages:
    // 1. Decomposition (returns JSON with subTasks)
    // 2. Subtask execution (returns result content)
    // 3. Merge (returns JSON with mergedOutput)
    const hiveProvider = makeMockProvider([
      {
        match: /STRATEGIC DECOMPOSITION/,
        content: JSON.stringify({
          subTasks: [
            { id: 'sub-1', description: 'part a', dependencies: [], estimatedTokens: 500 },
            { id: 'sub-2', description: 'part b', dependencies: [], estimatedTokens: 500 },
          ],
          strategy: 'parallel',
          rationale: 'split into two parts',
        }),
      },
      {
        match: /CORE SUB-AGENT DIRECTIVE/,
        content: 'subtask result',
      },
      {
        match: /RESULT SYNTHESIS/,
        content: JSON.stringify({
          mergedOutput: 'merged hive output',
          conflicts: [],
          resolved: true,
        }),
      },
    ]);

    const eventStream = new EventStream();
    const registry = makeRegistry();
    const costTracker = new CostTracker(eventStream);
    const engine = new DeliberationEngine({
      eventStream,
      registry,
      costTracker,
      providerFactory: makeFactory({
        [MOCK_IDS.hive]: hiveProvider,
      }),
    });

    const result = await engine.run(
      presets.hive([MOCK_IDS.hive], 'Do multiple things'),
    );

    expect(result.mode).toBe('hive');
    expect(result.output).toBe('merged hive output');
    expect(result.analysis.finalResponse).toBe('merged hive output');
    expect(result.analysis.thought).toContain('Decomposed into 2 subtasks');
    expect(result.degraded).toBe(false);
  });
});

describe('DeliberationEngine — auto preset', () => {
  it('selects solo for low-complexity tasks and returns normalized result', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const costTracker = new CostTracker(eventStream);
    const engine = new DeliberationEngine({
      eventStream,
      registry,
      costTracker,
      availableProviders: ['provider-a'],
      providerFactory: makeFactory({
        default: makeMockProvider([
          { match: /./, content: 'simple answer' },
        ]),
      }),
    });

    const result = await engine.run(presets.auto('fix typo'));

    expect(result.mode).toBe('auto');
    expect(result.autoSelection).toBeDefined();
    expect(result.autoSelection?.selectedPreset).toBe('solo');
    expect(result.autoSelection?.complexity).toBeDefined();
    expect(result.autoSelection?.reason).toBeDefined();
    expect(result.output).toBe('simple answer');
    expect(result.totalTokens).toBeGreaterThan(0);
  });

  it('emits auto_preset_selected event', async () => {
    const eventStream = new EventStream();
    const registry = makeRegistry();
    const engine = new DeliberationEngine({
      eventStream,
      registry,
      availableProviders: ['provider-a', 'provider-b'],
      providerFactory: makeFactory({
        default: makeMockProvider([
          { match: /./, content: 'result' },
        ]),
      }),
    });

    await engine.run(presets.auto('fix typo'));

    const events = eventStream.getAll();
    const autoEvent = events.find((e) => e.type === 'auto_preset_selected');
    expect(autoEvent).toBeDefined();
    expect(autoEvent).toHaveProperty('selectedPreset');
    expect(autoEvent).toHaveProperty('complexity');
    expect(autoEvent).toHaveProperty('taskType');
  });
});
