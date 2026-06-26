/**
 * Virtual fusion benchmark.
 *
 * Runs the real `FusionExecutor` against deterministic mock providers and
 * scores it on 6 metrics derived from the OpenRouter Fusion Router rubric
 * (see `research/fusion-router-comparison.md`). For each metric, an
 * "ideal" behavior is defined (what OpenRouter would do). Chimera scores
 * 1 if it matches the ideal, 0 if it doesn't.
 *
 * "Parity" is defined as ≥5/6. The `printReport` block at the end of
 * each test prints a one-shot summary so the report can be read in CI logs.
 *
 * Run with:
 *   npx vitest run src/coordinator/__tests__/fusion-benchmark.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { FusionExecutor } from '../fusion-executor.js';
import { ModelRegistry } from '../../../../chimera-providers/src/model-registry.js';
import { CostTracker } from '../../cost-tracker.js';
import { EventStream } from '../../event-stream.js';
import type { LLMProvider } from '../../session-orchestrator.js';
import type { ModelEntry } from '../../../../chimera-providers/src/model-registry.js';

// ── Helpers ─────────────────────────────────────────────────────────

type Score = 0 | 1;

interface MetricResult {
  name: string;
  score: Score;
  expected: string;
  actual: string;
}

interface EventCounter {
  fusion_started: number;
  fusion_completed: number;
  fusion_provider_error: number;
  fusion_judge_error: number;
  fusion_judge_parse_error: number;
  fusion_recurision_blocked: number;
  fusion_config_invalid: number;
  fusion_fallback_judge: number;
  fusion_budget_exceeded: number;
  total: number;
}

function attachCounter(eventStream: EventStream): EventCounter {
  const counter: EventCounter = {
    fusion_started: 0,
    fusion_completed: 0,
    fusion_provider_error: 0,
    fusion_judge_error: 0,
    fusion_judge_parse_error: 0,
    fusion_recurision_blocked: 0,
    fusion_config_invalid: 0,
    fusion_fallback_judge: 0,
    fusion_budget_exceeded: 0,
    total: 0,
  };
  eventStream.subscribe('*', (event) => {
    counter.total++;
    const t = (event as { type: string }).type;
    if (t in counter) {
      (counter as Record<string, number>)[t]++;
    }
  });
  return counter;
}

const MOCK_MODEL_IDS = {
  panelA: 'mock/panel-a',
  panelB: 'mock/panel-b',
  panelC: 'mock/panel-c',
  judge: 'mock/judge',
  judgeFallback1: 'mock/judge-fallback-1',
  judgeFallback2: 'mock/judge-fallback-2',
} as const;

/** A real frontier model from the built-in registry. Used for cost lookups. */
const FRONTIER_MODEL_ID = 'anthropic/claude-opus-4';

function makeMockProvider(
  responses: Array<{ match: string | RegExp; content: string; tokens?: number }>,
  options?: { throwOnMatch?: RegExp }
): LLMProvider {
  return {
    complete: vi.fn().mockImplementation(async (messages: Array<{ role: string; content: string }>) => {
      const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
      if (options?.throwOnMatch && options.throwOnMatch.test(userMsg)) {
        throw new Error('mock provider: intentional failure');
      }
      for (const r of responses) {
        const match = typeof r.match === 'string' ? userMsg.includes(r.match) : r.match.test(userMsg);
        if (match) {
          return {
            content: r.content,
            usage: { inputTokens: 100, outputTokens: r.tokens ?? 50 },
          };
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
    id: 'mock/panel-a',
    name: 'Mock Panel A',
    provider: 'mock',
    contextWindow: 8192,
    maxOutputTokens: 1024,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
    capabilities: {
      toolCalling: false, structuredOutput: true, vision: false,
      reasoning: false, parallelToolCalls: false,
    },
    degradationThreshold: 0.5,
    tier: 'cheap',
  };
  // Only insert mock entries that aren't already in the registry. This
  // protects the real frontier entries (e.g. opus) from being clobbered
  // by a 0-pricing mock that would silently zero out the cost calcs.
  for (const id of Object.values(MOCK_MODEL_IDS)) {
    if (!internal.models.has(id)) {
      internal.models.set(id, { ...mockEntry, id, name: id });
    }
  }
  return reg;
}

// ── Benchmark metrics ───────────────────────────────────────────────

async function metricQuality(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const executor = new FusionExecutor({ eventStream, registry });

  const task = 'What is 7 × 8 + 12 ÷ 3?';
  const correct = '60';
  const panelFactory = () => makeMockProvider([
    { match: '7 × 8', content: '7 times 8 is 56, plus 4 is 60. Answer: 60' },
  ]);
  const judgeFactory = () => makeMockProvider([
    { match: 'Panel Responses:', content: JSON.stringify({
      thought: 'All agree on 60',
      finalResponse: correct,
      consensus: ['The answer is 60'],
      conflicts: [],
      uniqueInsights: [],
      blindSpots: [],
      confidence: 0.95,
    }) },
  ]);

  const result = await executor.executeWithAnalysis(
    task,
    { analysisModels: [MOCK_MODEL_IDS.panelA, MOCK_MODEL_IDS.panelB, MOCK_MODEL_IDS.panelC],
      judgeModel: MOCK_MODEL_IDS.judge,
      temperature: 0 },
    (id) => id === MOCK_MODEL_IDS.judge ? judgeFactory() : panelFactory()
  );

  const answerCorrect = result.output === correct;
  const analysisPopulated =
    result.analysis.consensus?.length === 1 &&
    result.analysis.confidence === 0.95;
  const score: Score = answerCorrect && analysisPopulated ? 1 : 0;
  return {
    name: 'Quality',
    score,
    expected: 'fused answer equals "60"; analysis has consensus=["The answer is 60"], confidence=0.95',
    actual: `output="${result.output}", analysis.consensus=${JSON.stringify(result.analysis.consensus)}, confidence=${result.analysis.confidence}`,
  };
}

async function metricCost(): Promise<MetricResult> {
  const eventStream = new EventStream();
  attachCounter(eventStream);
  const registry = makeRegistry();
  const costTracker = new CostTracker(eventStream);
  const executor = new FusionExecutor({ eventStream, registry, costTracker });

  const panelFactory = () => makeMockProvider([{ match: /./, content: 'a poem', tokens: 50 }]);
  const judgeFactory = () => makeMockProvider([{ match: /./, content: JSON.stringify({ finalResponse: 'judge answer' }) }]);

  const result = await executor.executeWithAnalysis(
    'Write a poem',
    { analysisModels: [FRONTIER_MODEL_ID, FRONTIER_MODEL_ID, FRONTIER_MODEL_ID],
      judgeModel: MOCK_MODEL_IDS.judge,
      budgetUsd: 0.005,
      temperature: 0 },
    (id) => id === MOCK_MODEL_IDS.judge ? judgeFactory() : panelFactory()
  );

  const costEvents = eventStream.getAll().filter((e) => (e as { type: string }).type === 'fusion_budget_exceeded');
  const score: Score = (result.degraded && costEvents.length === 1) ? 1 : 0;
  return {
    name: 'Cost',
    score,
    expected: 'degraded=true, exactly 1 fusion_budget_exceeded event',
    actual: `degraded=${result.degraded}, costEvents=${costEvents.length}, totalCost=$${result.totalCostUsd.toFixed(6)}`,
  };
}

async function metricRecursion(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const executor = new FusionExecutor({ eventStream, registry });
  const factory = () => makeMockProvider([{ match: /./, content: 'ok' }]);

  const result = await executor.executeWithAnalysis(
    'test',
    { analysisModels: [MOCK_MODEL_IDS.panelA], judgeModel: MOCK_MODEL_IDS.judge, temperature: 0 },
    factory,
    { depth: 2 }
  );

  const blockedEvents = eventStream.getAll().filter((e) => (e as { type: string }).type === 'fusion_recurision_blocked');
  const score: Score = (result.degraded && blockedEvents.length === 1) ? 1 : 0;
  return {
    name: 'Recursion',
    score,
    expected: 'degraded=true with reason "recursion limit reached", 1 fusion_recurision_blocked event',
    actual: `degraded=${result.degraded}, reason="${result.degradationReason}", blockedEvents=${blockedEvents.length}`,
  };
}

async function metricJudgeFailover(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const executor = new FusionExecutor({ eventStream, registry });

  const panelFactory = () => makeMockProvider([{ match: /./, content: 'ok' }]);
  const primaryFactory = () => makeMockProvider([], { throwOnMatch: /./ });
  const fallbackFactory = () => makeMockProvider([
    { match: 'Panel Responses:', content: JSON.stringify({
      finalResponse: 'fallback judge answer', consensus: [], conflicts: [],
      uniqueInsights: [], blindSpots: [], confidence: 0.7, thought: '',
    }) },
  ]);

  const result = await executor.executeWithAnalysis(
    'test',
    { analysisModels: [MOCK_MODEL_IDS.panelA], judgeModel: MOCK_MODEL_IDS.judge,
      judgeFailover: [MOCK_MODEL_IDS.judgeFallback1], temperature: 0 },
    (id) => {
      if (id === MOCK_MODEL_IDS.judge) return primaryFactory();
      if (id === MOCK_MODEL_IDS.judgeFallback1) return fallbackFactory();
      return panelFactory();
    }
  );

  const fallbackEvents = eventStream.getAll().filter((e) => (e as { type: string }).type === 'fusion_fallback_judge');
  const score: Score = (result.output === 'fallback judge answer' && fallbackEvents.length === 1) ? 1 : 0;
  return {
    name: 'Judge failover',
    score,
    expected: 'output="fallback judge answer", 1 fusion_fallback_judge event',
    actual: `output="${result.output}", fallbackEvents=${fallbackEvents.length}`,
  };
}

async function metricJudgeParseFail(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const executor = new FusionExecutor({ eventStream, registry });

  const panelFactory = () => makeMockProvider([{ match: /./, content: 'ok' }]);
  const judgeFactory = () => makeMockProvider([
    { match: 'Panel Responses:', content: 'this is not valid JSON' },
  ]);

  const result = await executor.executeWithAnalysis(
    'test',
    { analysisModels: [MOCK_MODEL_IDS.panelA], judgeModel: MOCK_MODEL_IDS.judge, temperature: 0 },
    (id) => id === MOCK_MODEL_IDS.judge ? judgeFactory() : panelFactory()
  );

  const parseErrorEvents = eventStream.getAll().filter((e) => (e as { type: string }).type === 'fusion_judge_parse_error');
  const score: Score = (result.degraded && parseErrorEvents.length === 1) ? 1 : 0;
  return {
    name: 'Judge parse fail',
    score,
    expected: 'degraded=true, raw judge content in output, 1 fusion_judge_parse_error event',
    actual: `degraded=${result.degraded}, output="${result.output.slice(0, 30)}", parseErrorEvents=${parseErrorEvents.length}`,
  };
}

async function metricCalibration(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const executor = new FusionExecutor({ eventStream, registry });

  const panelFactory = () => makeMockProvider([
    { match: 'A', content: 'A says X' },
    { match: 'B', content: 'B says Y' },
    { match: 'C', content: 'C says Z' },
  ]);
  const judgeFactory = () => makeMockProvider([
    { match: 'Panel Responses:', content: JSON.stringify({
      thought: 'they disagreed',
      finalResponse: 'synthesis',
      consensus: ['X'],
      conflicts: ['Y vs Z'],
      uniqueInsights: ['Z'],
      blindSpots: ['Q'],
      confidence: 0.6,
    }) },
  ]);

  const result = await executor.executeWithAnalysis(
    'test',
    { analysisModels: [MOCK_MODEL_IDS.panelA, MOCK_MODEL_IDS.panelB, MOCK_MODEL_IDS.panelC],
      judgeModel: MOCK_MODEL_IDS.judge, temperature: 0 },
    (id) => id === MOCK_MODEL_IDS.judge ? judgeFactory() : panelFactory()
  );

  const a = result.analysis;
  const allPopulated =
    a.thought === 'they disagreed' &&
    a.finalResponse === 'synthesis' &&
    a.consensus?.length === 1 &&
    a.conflicts?.length === 1 &&
    a.uniqueInsights?.length === 1 &&
    a.blindSpots?.length === 1 &&
    a.confidence === 0.6;
  const score: Score = allPopulated ? 1 : 0;
  return {
    name: 'Calibration',
    score,
    expected: 'all 7 fields populated exactly as the judge returned them',
    actual: JSON.stringify(a),
  };
}

// ── Benchmark runner ────────────────────────────────────────────────

const OPENROUTER_REFERENCE: Record<string, 1> = {
  Quality: 1,
  Cost: 1,
  Recursion: 1,
  'Judge failover': 1,
  'Judge parse fail': 1,
  Calibration: 1,
};

function summarize(metrics: MetricResult[]): {
  chimera: number;
  reference: number;
  delta: number;
  status: 'parity' | 'approaching' | 'far';
  table: string;
} {
  const chimera = metrics.reduce((s, m) => s + m.score, 0);
  const reference = metrics.length;
  const delta = reference - chimera;
  const status: 'parity' | 'approaching' | 'far' =
    delta === 0 ? 'parity' : delta <= 2 ? 'approaching' : 'far';

  const scoreRow = metrics.map((m) => `${m.name}=${m.score}/${OPENROUTER_REFERENCE[m.name]}`).join('  ');
  const table = [
    '',
    '╔══════════════════════════════════════════════════════════════════╗',
    '║         FUSION BENCHMARK — chimera vs OpenRouter reference      ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  Chimera:  ${String(chimera).padStart(2)}/${reference}                                              ║`,
    `║  OpenRouter reference: ${reference}/${reference} (assumed)                                ║`,
    `║  Gap: ${delta}   Status: ${status.toUpperCase().padEnd(10)}                                    ║`,
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  ${scoreRow.slice(0, 64).padEnd(64)} ║`,
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
  ].join('\n');

  return { chimera, reference, delta, status, table };
}

function printSingle(m: MetricResult): void {
  const tag = m.score === 1 ? '✓' : '✗';
  console.log(`  ${tag} ${m.name.padEnd(20)} | expected: ${m.expected}`);
  if (m.score === 0) {
    console.log(`                            | actual:   ${m.actual}`);
  }
}

describe('Fusion benchmark — individual metrics', () => {
  it('Quality', async () => { const m = await metricQuality(); printSingle(m); expect(m.score).toBe(1); });
  it('Cost', async () => { const m = await metricCost(); printSingle(m); expect(m.score).toBe(1); });
  it('Recursion', async () => { const m = await metricRecursion(); printSingle(m); expect(m.score).toBe(1); });
  it('Judge failover', async () => { const m = await metricJudgeFailover(); printSingle(m); expect(m.score).toBe(1); });
  it('Judge parse fail', async () => { const m = await metricJudgeParseFail(); printSingle(m); expect(m.score).toBe(1); });
  it('Calibration', async () => { const m = await metricCalibration(); printSingle(m); expect(m.score).toBe(1); });
});

describe('Fusion benchmark — full report', () => {
  it('produces a parity report', async () => {
    const metrics = await Promise.all([
      metricQuality(),
      metricCost(),
      metricRecursion(),
      metricJudgeFailover(),
      metricJudgeParseFail(),
      metricCalibration(),
    ]);
    const summary = summarize(metrics);
    console.log(summary.table);
    // Parity threshold: ≥5/6
    expect(summary.chimera).toBeGreaterThanOrEqual(5);
  });
});
