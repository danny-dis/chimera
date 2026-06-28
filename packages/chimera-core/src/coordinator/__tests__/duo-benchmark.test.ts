/**
 * Virtual duo benchmark.
 *
 * Mirrors `trio-benchmark.test.ts` for the duo executor — a 2-model
 * sequential mode (writer → reviewer) with deterministic synthesis.
 * 3 metrics verify the defining properties of duo: role-authority
 * synthesis resolution, degraded fallback when Model B throws, and
 * budget enforcement.
 *
 * Run with:
 *   npx vitest run src/coordinator/__tests__/duo-benchmark.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { DuoExecutor } from '../duo-executor.js';
import { ModelRegistry } from '../../../../chimera-providers/src/model-registry.js';
import { ResponseSynthesizer } from '../../response-synthesizer.js';
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

const MOCK_IDS = {
  writer: 'mock/duo-bench-writer',
  reviewer: 'mock/duo-bench-reviewer',
} as const;

const FRONTIER_MODEL_ID = 'anthropic/claude-opus-4';

function makeMockProvider(
  responses: Array<{ match: string | RegExp; content: string; tokens?: number }>
): LLMProvider {
  return {
    complete: vi.fn().mockImplementation(async (messages: Array<{ role: string; content: string }>) => {
      const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
      for (const r of responses) {
        const match = typeof r.match === 'string' ? userMsg.includes(r.match) : r.match.test(userMsg);
        if (match) return { content: r.content, usage: { inputTokens: 100, outputTokens: r.tokens ?? 50 } };
      }
      return { content: 'fallback', usage: { inputTokens: 100, outputTokens: 10 } };
    }),
  } as unknown as LLMProvider;
}

function makeRegistry(): ModelRegistry {
  const reg = new ModelRegistry();
  const internal = reg as unknown as { models: Map<string, ModelEntry> };
  const mockEntry: ModelEntry = {
    id: MOCK_IDS.writer, name: 'Mock Duo Writer', provider: 'mock',
    contextWindow: 8192, maxOutputTokens: 1024,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
    capabilities: { toolCalling: false, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
    degradationThreshold: 0.5, tier: 'cheap',
  };
  for (const id of Object.values(MOCK_IDS)) {
    if (!internal.models.has(id)) internal.models.set(id, { ...mockEntry, id, name: id });
  }
  return reg;
}

// ── Metrics ─────────────────────────────────────────────────────────

/**
 * Synthesis quality: verify that the ResponseSynthesizer resolves a
 * writer/reviewer contradiction via role authority (reviewer=3 > writer=1).
 * The DuoExecutor itself does not invoke ResponseSynthesizer, but
 * deterministic synthesis is a core duo property — we verify the
 * synthesizer directly here.
 */
async function metricSynthesisQuality(): Promise<MetricResult> {
  const synthesizer = new ResponseSynthesizer(new EventStream());
  const result = synthesizer.synthesize([
    { agentId: 'writer', role: 'writer', content: 'use caching for performance', confidence: 0.8 },
    { agentId: 'reviewer', role: 'reviewer', content: 'do not use caching for performance', confidence: 0.7 },
  ]);

  const outputLower = result.unifiedResponse.toLowerCase();
  const mentionsRoleAuthority = /role\s+authority/.test(outputLower);
  const reviewerWins = /reviewer[\s\S]*overrides[\s\S]*writer/i.test(outputLower);
  const hasContradiction = result.conflicts.some((c) => c.type === 'contradiction');
  const notEscalated = !result.needsUserEscalation;

  const score: Score = (mentionsRoleAuthority && reviewerWins && hasContradiction && notEscalated) ? 1 : 0;
  return {
    name: 'Synthesis quality',
    score,
    expected: 'role authority resolves contradiction with reviewer overriding writer, no escalation',
    actual: `mentionsRoleAuthority=${mentionsRoleAuthority}, reviewerWins=${reviewerWins}, conflicts=${JSON.stringify(result.conflicts.map((c) => ({ type: c.type, resolvedBy: c.resolvedBy })))}, escalated=${result.needsUserEscalation}`,
  };
}

/**
 * Degraded fallback: Model B throws. Verify the DuoExecutor returns
 * `degraded: true` with a defined degradation reason (never throws).
 */
async function metricDegradedFallback(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const executor = new DuoExecutor({ eventStream, registry });

  const writerFactory = () => makeMockProvider([{ match: /./, content: 'writer output' }]);
  const brokenReviewerFactory = () => ({
    complete: vi.fn().mockRejectedValue(new Error('model unavailable')),
  } as unknown as LLMProvider);

  const factory = (id: string) => {
    if (id === MOCK_IDS.writer) return writerFactory();
    if (id === MOCK_IDS.reviewer) return brokenReviewerFactory();
    throw new Error(`unknown: ${id}`);
  };

  const result = await executor.executeWithAnalysis(
    'test',
    { modelA: MOCK_IDS.writer, modelB: MOCK_IDS.reviewer, temperature: 0 },
    factory
  );

  const score: Score = (result.degraded && result.degradationReason !== undefined) ? 1 : 0;
  return {
    name: 'Degraded fallback',
    score,
    expected: 'degraded=true and degradationReason defined when Model B throws',
    actual: `degraded=${result.degraded}, reason="${result.degradationReason}"`,
  };
}

/**
 * Cost enforcement: use a frontier model with real pricing, set a very
 * low budget. Verify the executor degrades with a budget-related reason.
 */
async function metricCostEnforcement(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const executor = new DuoExecutor({ eventStream, registry });

  const factory = (_id: string) => makeMockProvider([{ match: /./, content: 'content' }]);

  const result = await executor.executeWithAnalysis(
    'test',
    { modelA: 'anthropic/claude-opus-4', modelB: 'openai/gpt-5', budgetUsd: 0.005, temperature: 0 },
    factory
  );

  const score: Score = (result.degraded && /budget/i.test(result.degradationReason ?? '')) ? 1 : 0;
  return {
    name: 'Cost enforcement',
    score,
    expected: 'degraded=true with reason matching /budget/i',
    actual: `degraded=${result.degraded}, reason="${result.degradationReason}"`,
  };
}

// ── Runner ──────────────────────────────────────────────────────────

const DUO_REFERENCE: Record<string, 1> = {
  'Synthesis quality': 1,
  'Degraded fallback': 1,
  'Cost enforcement': 1,
};

function summarize(metrics: MetricResult[]): {
  duo: number;
  reference: number;
  delta: number;
  status: 'parity' | 'approaching' | 'far';
  table: string;
} {
  const duo = metrics.reduce((s, m) => s + m.score, 0);
  const reference = metrics.length;
  const delta = reference - duo;
  const status: 'parity' | 'approaching' | 'far' = delta === 0 ? 'parity' : delta <= 1 ? 'approaching' : 'far';
  const scoreRow = metrics.map((m) => `${m.name}=${m.score}/${DUO_REFERENCE[m.name]}`).join('  ');
  const table = [
    '',
    '╔══════════════════════════════════════════════════════════════════╗',
    '║         DUO BENCHMARK — chimera duo sequential mode             ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  Chimera duo: ${String(duo).padStart(2)}/${reference} (writer→reviewer, deterministic synthesis)     ║`,
    `║  Reference:    ${reference}/${reference} (parity)                                          ║`,
    `║  Gap: ${delta}   Status: ${status.toUpperCase().padEnd(10)}                                    ║`,
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  ${scoreRow.slice(0, 64).padEnd(64)} ║`,
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
  ].join('\n');
  return { duo, reference, delta, status, table };
}

function printSingle(m: MetricResult): void {
  const tag = m.score === 1 ? 'PASS' : 'FAIL';
  console.log(`  ${tag} ${m.name.padEnd(28)} | expected: ${m.expected}`);
  if (m.score === 0) {
    console.log(`                               | actual:   ${m.actual}`);
  }
}

describe('Duo benchmark — individual metrics', () => {
  it('Synthesis quality', async () => { const m = await metricSynthesisQuality(); printSingle(m); expect(m.score).toBe(1); });
  it('Degraded fallback', async () => { const m = await metricDegradedFallback(); printSingle(m); expect(m.score).toBe(1); });
  it('Cost enforcement', async () => { const m = await metricCostEnforcement(); printSingle(m); expect(m.score).toBe(1); });
});

describe('Duo benchmark — full report', () => {
  it('produces a parity report', async () => {
    const metrics = await Promise.all([
      metricSynthesisQuality(),
      metricDegradedFallback(),
      metricCostEnforcement(),
    ]);
    const summary = summarize(metrics);
    console.log(summary.table);
    expect(summary.duo).toBeGreaterThanOrEqual(2);
  });
});
