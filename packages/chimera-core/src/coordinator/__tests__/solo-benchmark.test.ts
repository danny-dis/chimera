/**
 * Virtual solo benchmark.
 *
 * Mirrors `trio-benchmark.test.ts` for the solo executor — the simplest
 * mode (one model, one prompt, no panel, no judge, no synthesis). One
 * metric verifies the defining property of solo: exactly one LLM call,
 * output is the model's content verbatim, and the 5-field analysis
 * shape is preserved (with empty consensus/conflicts/insights/blindSpots
 * arrays) so downstream consumers can treat all modes uniformly.
 *
 * Run with:
 *   npx vitest run src/coordinator/__tests__/solo-benchmark.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { SoloExecutor } from '../solo-executor.js';
import { ModelRegistry } from '../../../../chimera-providers/src/model-registry.js';
import { EventStream } from '../../event-stream.js';
import type { LLMProvider } from '../../session-orchestrator.js';
import type { ModelEntry } from '../../../../chimera-providers/src/model-registry.js';

type Score = 0 | 1;

interface MetricResult {
  name: string;
  score: Score;
  expected: string;
  actual: string;
}

const MOCK_ID = 'mock/solo-bench';

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
    id: MOCK_ID,
    name: 'Mock Solo Bench',
    provider: 'mock',
    contextWindow: 8192,
    maxOutputTokens: 1024,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
    capabilities: { toolCalling: false, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
    degradationThreshold: 0.5,
    tier: 'cheap',
  };
  if (!internal.models.has(MOCK_ID)) internal.models.set(MOCK_ID, mockEntry);
  return reg;
}

// ── Metrics ─────────────────────────────────────────────────────────

async function metricSingleCall(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const executor = new SoloExecutor({ eventStream, registry });

  const provider = makeMockProvider([{ match: /./, content: 'SOLO_OUTPUT' }]);
  const factory = (_id: string) => provider;

  const result = await executor.executeWithAnalysis(
    'test',
    { model: MOCK_ID, temperature: 0, selfVerify: false },
    factory
  );

  const completeFn = provider.complete as unknown as { mock: { calls: unknown[] } };
  const callCount = completeFn.mock.calls.length;
  const singleCall = callCount === 1;
  const outputMatches = result.output === 'SOLO_OUTPUT';
  const notDegraded = !result.degraded;
  const analysisShapeCorrect =
    result.analysis.finalResponse === 'SOLO_OUTPUT' &&
    Array.isArray(result.analysis.consensus) &&
    result.analysis.consensus.length === 0 &&
    Array.isArray(result.analysis.conflicts) &&
    result.analysis.conflicts.length === 0 &&
    Array.isArray(result.analysis.uniqueInsights) &&
    result.analysis.uniqueInsights.length === 0 &&
    Array.isArray(result.analysis.blindSpots) &&
    result.analysis.blindSpots.length === 0 &&
    result.analysis.confidence === 0.8;
  const score: Score = (singleCall && outputMatches && notDegraded && analysisShapeCorrect) ? 1 : 0;
  return {
    name: 'Single call',
    score,
    expected: 'exactly 1 LLM call, output="SOLO_OUTPUT", not degraded, 5-field shape with empty arrays and confidence=0.8',
    actual: `calls=${callCount}, output="${result.output}", degraded=${result.degraded}, finalResponse="${result.analysis.finalResponse}", consensus=${JSON.stringify(result.analysis.consensus)}, confidence=${result.analysis.confidence}`,
  };
}

// ── Runner ──────────────────────────────────────────────────────────

const SOLO_REFERENCE: Record<string, 1> = {
  'Single call': 1,
};

function summarize(metrics: MetricResult[]): {
  solo: number;
  reference: number;
  delta: number;
  status: 'parity' | 'approaching' | 'far';
  table: string;
} {
  const solo = metrics.reduce((s, m) => s + m.score, 0);
  const reference = metrics.length;
  const delta = reference - solo;
  const status: 'parity' | 'approaching' | 'far' = delta === 0 ? 'parity' : 'approaching';
  const scoreRow = metrics.map((m) => `${m.name}=${m.score}/${SOLO_REFERENCE[m.name]}`).join('  ');
  const table = [
    '',
    '╔══════════════════════════════════════════════════════════════════╗',
    '║         SOLO BENCHMARK — chimera solo executor (simplest mode)   ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  Chimera solo: ${String(solo).padStart(2)}/${reference} (1 LLM call, 5-field shape preserved)             ║`,
    `║  Reference:    ${reference}/${reference} (parity)                                          ║`,
    `║  Gap: ${delta}   Status: ${status.toUpperCase().padEnd(10)}                                    ║`,
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  ${scoreRow.slice(0, 64).padEnd(64)} ║`,
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
  ].join('\n');
  return { solo, reference, delta, status, table };
}

function printSingle(m: MetricResult): void {
  const tag = m.score === 1 ? '✓' : '✗';
  console.log(`  ${tag} ${m.name.padEnd(28)} | expected: ${m.expected}`);
  if (m.score === 0) {
    console.log(`                               | actual:   ${m.actual}`);
  }
}

describe('Solo benchmark — individual metrics', () => {
  it('Single call', async () => {
    const m = await metricSingleCall();
    printSingle(m);
    expect(m.score).toBe(1);
  });
});

describe('Solo benchmark — full report', () => {
  it('produces a parity report', async () => {
    const metrics = await Promise.all([metricSingleCall()]);
    const summary = summarize(metrics);
    console.log(summary.table);
    // Solo parity = 1/1 (single metric, simplest mode).
    expect(summary.solo).toBe(1);
  });
});
