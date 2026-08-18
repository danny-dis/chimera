/**
 * Extended deliberation benchmark (section 19.6).
 *
 * Runs solo, duo, and trio metrics THROUGH the unified
 * `DeliberationEngine` facade (not the raw executors — that's what
 * `combined-benchmark.test.ts` does). Each metric verifies one defining
 * property of its mode; the final section prints a combined parity
 * report comparing the three modes side by side.
 *
 * All providers are mocked. No network, no real keys, deterministic.
 *
 * Run with:
 *   npx vitest run src/coordinator/__tests__/deliberation-benchmark.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { DeliberationEngine } from '../deliberation/engine.js';
import { ResponseSynthesizer } from '../response-synthesizer.js';
import { SimpleModelRegistry } from '@chimera/providers';
import { CostTracker } from '../../cost-tracker.js';
import { EventStream } from '../../event-stream.js';
import type { LLMProvider } from '../../session-orchestrator.js';
import type { ModelEntry } from '@chimera/providers';
import type { WorktreeIsolation, WorktreeInfo } from '../../agent/worktree-isolation.js';

type Score = 0 | 1;

interface MetricResult {
  name: string;
  score: Score;
  expected: string;
  actual: string;
  mode: 'solo' | 'duo' | 'trio';
}

const MOCK_IDS = {
  solo: 'mock/delib-solo',
  duoA: 'mock/delib-duo-a',
  duoB: 'mock/delib-duo-b',
  writer: 'mock/delib-trio-writer',
  reviewer: 'mock/delib-trio-reviewer',
  challenger: 'mock/delib-trio-challenger',
} as const;

const ROLE_IDS = { writer: 'writer', reviewer: 'reviewer', challenger: 'challenger' } as const;

const FRONTIER_MODEL_ID = 'anthropic/claude-opus-4';
const MOCK_WORKTREE_PATH = '/tmp/delib-mock-worktree';

function makeMockProvider(
  responses: Array<{ match: string | RegExp; content: string; tokens?: number }>
): LLMProvider {
  return {
    complete: vi.fn().mockImplementation(async (messages: Array<{ role: string; content: string }>) => {
      // Search ALL messages (system + user) for matches, like the engine tests.
      const allContent = messages.map((m) => m.content).join('\n');
      for (const r of responses) {
        const match = typeof r.match === 'string' ? allContent.includes(r.match) : r.match.test(allContent);
        if (match) return { content: r.content, usage: { inputTokens: 100, outputTokens: r.tokens ?? 50 } };
      }
      return { content: 'fallback', usage: { inputTokens: 100, outputTokens: 10 } };
    }),
  } as unknown as LLMProvider;
}

function makeRegistry(): SimpleModelRegistry {
  const reg = new SimpleModelRegistry();
  const internal = reg as unknown as { models: Map<string, ModelEntry> };
  const mockEntry: ModelEntry = {
    id: MOCK_IDS.solo, name: 'Mock Deliberation', provider: 'mock',
    contextWindow: 8192, maxOutputTokens: 1024,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
    capabilities: { toolCalling: false, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
    degradationThreshold: 0.5, tier: 'cheap',
  };
  for (const id of [...Object.values(MOCK_IDS), ...Object.values(ROLE_IDS)]) {
    if (!internal.models.has(id)) internal.models.set(id, { ...mockEntry, id, name: id });
  }
  if (!internal.models.has(FRONTIER_MODEL_ID)) internal.models.set(FRONTIER_MODEL_ID, { id: FRONTIER_MODEL_ID, name: 'Claude Opus 4', provider: 'anthropic', contextWindow: 200000, maxOutputTokens: 8192, pricing: { inputPerMillion: 15, outputPerMillion: 75 }, capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true }, degradationThreshold: 0.6, tier: 'frontier' });
  return reg;
}

function makeMockWorktreeIsolation(): WorktreeIsolation {
  return {
    createIsolatedWorktree: vi.fn().mockImplementation(async (agentId: string): Promise<WorktreeInfo> => ({
      worktreePath: MOCK_WORKTREE_PATH,
      branch: `chimera-agent-${agentId.slice(0, 8)}`,
      headCommit: 'mockcommit000',
      gitRoot: '/tmp/repo',
    })),
    cleanupWorktree: vi.fn().mockResolvedValue(undefined),
    hasWorktreeChanges: vi.fn().mockResolvedValue(false),
  } as unknown as WorktreeIsolation;
}

function countCalls(provider: LLMProvider): number {
  return (provider.complete as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
}

// ── Solo metrics (1) ────────────────────────────────────────────────

/**
 * Single call: engine solo with `eternalCoT:false, selfVerify:false`
 * makes exactly one LLM call and returns the model's content verbatim
 * with the uniform 5-field analysis shape.
 */
async function metricSoloSingleCall(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const provider = makeMockProvider([{ match: 'You are the writer', content: 'SOLO_OUTPUT' }]);
  const engine = new DeliberationEngine({
    eventStream,
    registry,
    providerFactory: () => provider,
  });

  const result = await engine.run({
    mode: 'solo',
    model: MOCK_IDS.solo,
    task: 'test',
    temperature: 0,
    eternalCoT: false,
    selfVerify: false,
  });

  const singleCall = countCalls(provider) === 1;
  const outputMatches = result.output === 'SOLO_OUTPUT';
  const notDegraded = !result.degraded;
  const shapeCorrect =
    result.analysis.finalResponse === 'SOLO_OUTPUT' &&
    Array.isArray(result.analysis.consensus) &&
    Array.isArray(result.analysis.conflicts) &&
    Array.isArray(result.analysis.uniqueInsights) &&
    Array.isArray(result.analysis.blindSpots) &&
    typeof result.analysis.confidence === 'number';

  const score: Score = (singleCall && outputMatches && notDegraded && shapeCorrect) ? 1 : 0;
  return {
    name: 'Single call', mode: 'solo', score,
    expected: 'engine solo makes exactly 1 LLM call, output="SOLO_OUTPUT", 5-field shape, not degraded',
    actual: `calls=${countCalls(provider)}, output="${result.output}", degraded=${result.degraded}, confidence=${result.analysis.confidence}`,
  };
}

// ── Duo metrics (3) ─────────────────────────────────────────────────

async function metricDuoSynthesisQuality(): Promise<MetricResult> {
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
    name: 'Synthesis quality', mode: 'duo', score,
    expected: 'role authority resolves contradiction, reviewer overrides writer, no escalation',
    actual: `mentionsRoleAuthority=${mentionsRoleAuthority}, reviewerWins=${reviewerWins}, escalated=${result.needsUserEscalation}`,
  };
}

/**
 * Deterministic path: the engine duo mode runs twice with identical
 * mocks. Output must be byte-identical across runs (no randomness, no
 * LLM judge) and the reviewer's improved answer must win, with exactly
 * 2 LLM calls.
 */
async function metricDuoDeterministicPath(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const writerProvider = makeMockProvider([{ match: 'You are the writer', content: 'draft content' }]);
  const reviewerProvider = makeMockProvider([{ match: 'You are the reviewer', content: 'reviewed content' }]);
  const engine = new DeliberationEngine({
    eventStream,
    registry,
    providerFactory: (id: string) => {
      if (id === MOCK_IDS.duoA) return writerProvider;
      if (id === MOCK_IDS.duoB) return reviewerProvider;
      throw new Error(`unknown: ${id}`);
    },
  });

  const config = { mode: 'duo' as const, modelA: MOCK_IDS.duoA, modelB: MOCK_IDS.duoB, task: 'test', temperature: 0 };
  const first = await engine.run(config);
  const second = await engine.run(config);

  const outputsIdentical = first.output === second.output;
  const reviewerWins = first.output === 'reviewed content';
  // Two runs × (writer + reviewer) = exactly 4 calls; no hidden judge/synthesizer call.
  const noJudge = countCalls(writerProvider) + countCalls(reviewerProvider) === 4;
  const notDegraded = !first.degraded && !second.degraded;

  const score: Score = (outputsIdentical && reviewerWins && noJudge && notDegraded) ? 1 : 0;
  return {
    name: 'Deterministic path', mode: 'duo', score,
    expected: 'two identical runs → identical output, reviewer wins, exactly 2 LLM calls per run (no judge)',
    actual: `run1="${first.output}", run2="${second.output}", identical=${outputsIdentical}, reviewerWins=${reviewerWins}, calls=${countCalls(writerProvider) + countCalls(reviewerProvider)}, degraded=${first.degraded}`,
  };
}

/**
 * Cost: engine duo with a real `CostTracker` wired in. `recordSpend`
 * must fire before a low budget on a frontier writer trips degraded.
 */
async function metricDuoCost(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const costTracker = new CostTracker(eventStream);
  const recordSpendSpy = vi.spyOn(costTracker, 'recordSpend');
  const engine = new DeliberationEngine({
    eventStream,
    registry,
    costTracker,
    providerFactory: (_id: string) => makeMockProvider([{ match: /./, content: 'content' }]),
  });

  const result = await engine.run({
    mode: 'duo',
    modelA: FRONTIER_MODEL_ID,
    modelB: 'openai/gpt-5',
    task: 'test',
    temperature: 0,
    budgetUsd: 0.005,
  });

  const budgetTripped = result.degraded && /budget/i.test(result.degradationReason ?? '');
  const spendRecorded = recordSpendSpy.mock.calls.length > 0;
  const totalSpend = costTracker.getTotalCost();

  const score: Score = (budgetTripped && spendRecorded && totalSpend > 0) ? 1 : 0;
  return {
    name: 'Cost', mode: 'duo', score,
    expected: 'recordSpend fires, total cost > 0, then low budget trips degraded',
    actual: `degraded=${result.degraded}, reason="${result.degradationReason}", recordSpendCalls=${recordSpendSpy.mock.calls.length}, totalCost=${totalSpend}`,
  };
}

// ── Trio metrics (4) ────────────────────────────────────────────────

/**
 * Full gate: engine trio runs writer + reviewer + challenger (3 calls),
 * produces non-empty output with a confidence score, not degraded.
 */
async function metricTrioFullGate(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const writerProvider = makeMockProvider([{ match: 'You are a code writer', content: 'writer draft' }]);
  const reviewerProvider = makeMockProvider([{ match: 'You are a code reviewer', content: JSON.stringify({ verdict: 'pass', issues: [], commentary: 'ok' }) }]);
  const challengerProvider = makeMockProvider([{ match: 'You are the challenger', content: JSON.stringify({ challenges: [], alternatives: [] }) }]);
  const engine = new DeliberationEngine({
    eventStream,
    registry,
    providerFactory: (id: string) => {
      if (id === MOCK_IDS.writer) return writerProvider;
      if (id === MOCK_IDS.reviewer) return reviewerProvider;
      if (id === MOCK_IDS.challenger) return challengerProvider;
      throw new Error(`unknown: ${id}`);
    },
  });

  const result = await engine.run({
    mode: 'trio',
    writer: MOCK_IDS.writer,
    reviewer: MOCK_IDS.reviewer,
    challenger: MOCK_IDS.challenger,
    task: 'test',
    temperature: 0,
  });

  const callCount = countCalls(writerProvider) + countCalls(reviewerProvider) + countCalls(challengerProvider);
  const allStagesRan = callCount === 3;
  const outputNonEmpty = result.output.length > 0;
  const confidenceSet = typeof result.analysis.confidence === 'number' && result.analysis.confidence > 0;
  const notDegraded = !result.degraded;

  const score: Score = (allStagesRan && outputNonEmpty && confidenceSet && notDegraded) ? 1 : 0;
  return {
    name: 'Full gate', mode: 'trio', score,
    expected: '3 LLM calls (writer+reviewer+challenger), non-empty output, confidence set, not degraded',
    actual: `calls=${callCount}, output="${result.output.slice(0, 50)}", confidence=${result.analysis.confidence}, degraded=${result.degraded}`,
  };
}

/**
 * Isolation: engine trio with a mocked `WorktreeIsolation`; the draft
 * must run inside the isolated worktree exactly once and not degrade.
 */
async function metricTrioIsolation(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const worktreeIsolation = makeMockWorktreeIsolation();
  const engine = new DeliberationEngine({
    eventStream,
    registry,
    worktreeIsolation,
    providerFactory: (id: string) => {
      if (id === MOCK_IDS.writer) return makeMockProvider([{ match: 'You are a code writer', content: 'isolated draft' }]);
      if (id === MOCK_IDS.reviewer) return makeMockProvider([{ match: 'You are a code reviewer', content: JSON.stringify({ verdict: 'pass', issues: [], commentary: 'ok' }) }]);
      if (id === MOCK_IDS.challenger) return makeMockProvider([{ match: 'You are the challenger', content: JSON.stringify({ challenges: [], alternatives: [] }) }]);
      throw new Error(`unknown: ${id}`);
    },
  });

  const result = await engine.run({
    mode: 'trio',
    writer: MOCK_IDS.writer,
    reviewer: MOCK_IDS.reviewer,
    challenger: MOCK_IDS.challenger,
    task: 'test',
    temperature: 0,
    isolateWorktree: true,
  });

  const mock = worktreeIsolation as unknown as { createIsolatedWorktree: { mock: { calls: unknown[] } } };
  const createCalls = mock.createIsolatedWorktree.mock.calls.length;

  const score: Score = (!result.degraded && createCalls === 1) ? 1 : 0;
  return {
    name: 'Isolation', mode: 'trio', score,
    expected: `not degraded, createIsolatedWorktree called exactly once (worktree="${MOCK_WORKTREE_PATH}")`,
    actual: `degraded=${result.degraded}, createCalls=${createCalls}`,
  };
}

/**
 * Cost: engine trio with a real `CostTracker`. `recordSpend` fires for
 * the frontier writer before the low budget trips degraded.
 */
async function metricTrioCost(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const costTracker = new CostTracker(eventStream);
  const recordSpendSpy = vi.spyOn(costTracker, 'recordSpend');
  const engine = new DeliberationEngine({
    eventStream,
    registry,
    costTracker,
    providerFactory: (id: string) => {
      if (id === MOCK_IDS.challenger) return makeMockProvider([{ match: /./, content: 'challenge' }]);
      if (id === FRONTIER_MODEL_ID) return makeMockProvider([{ match: /./, content: 'content' }]);
      throw new Error(`unknown: ${id}`);
    },
  });

  const result = await engine.run({
    mode: 'trio',
    writer: FRONTIER_MODEL_ID,
    reviewer: FRONTIER_MODEL_ID,
    challenger: MOCK_IDS.challenger,
    task: 'test',
    temperature: 0,
    budgetUsd: 0.001,
  });

  const budgetTripped = result.degraded && /budget/i.test(result.degradationReason ?? '');
  const spentOnFrontier = recordSpendSpy.mock.calls.some((c) => c[0] === FRONTIER_MODEL_ID);
  const totalSpend = costTracker.getTotalCost();

  const score: Score = (budgetTripped && spentOnFrontier && totalSpend > 0) ? 1 : 0;
  return {
    name: 'Cost', mode: 'trio', score,
    expected: 'recordSpend fires for the frontier writer, total cost > 0, then low budget trips degraded',
    actual: `degraded=${result.degraded}, reason="${result.degradationReason}", recordSpendCalls=${recordSpendSpy.mock.calls.length}, totalCost=${totalSpend}`,
  };
}

/**
 * Role-based synthesis: writer and reviewer contradict on a shared
 * topic; the deterministic synthesizer must resolve via role authority
 * with the reviewer overriding the writer.
 */
async function metricTrioRoleSynthesis(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const engine = new DeliberationEngine({
    eventStream,
    registry,
    providerFactory: (id: string) => {
      if (id === ROLE_IDS.writer) return makeMockProvider([{ match: 'You are a code writer', content: 'use caching for performance optimization' }]);
      if (id === ROLE_IDS.reviewer) return makeMockProvider([{ match: 'You are a code reviewer', content: 'do not use caching for performance optimization' }]);
      if (id === ROLE_IDS.challenger) return makeMockProvider([{ match: 'You are the challenger', content: JSON.stringify({ challenges: ['consider invalidation cost'], alternatives: [] }) }]);
      throw new Error(`unknown: ${id}`);
    },
  });

  const result = await engine.run({
    mode: 'trio',
    writer: ROLE_IDS.writer,
    reviewer: ROLE_IDS.reviewer,
    challenger: ROLE_IDS.challenger,
    task: 'test',
    temperature: 0,
  });

  const outputLower = result.output.toLowerCase();
  const mentionsRoleAuthority = /role\s+authority/.test(outputLower);
  const reviewerWins = /reviewer[\s\S]*overrides[\s\S]*writer|role\s+authority[\s\S]*reviewer/i.test(outputLower);
  const notDegraded = !result.degraded;

  const score: Score = (mentionsRoleAuthority && reviewerWins && notDegraded) ? 1 : 0;
  return {
    name: 'Role-based synthesis', mode: 'trio', score,
    expected: 'output cites role authority with reviewer overriding writer, not degraded',
    actual: `mentionsRoleAuthority=${mentionsRoleAuthority}, reviewerWins=${reviewerWins}, degraded=${result.degraded}, output="${result.output.slice(0, 120)}"`,
  };
}

// ── Runner ──────────────────────────────────────────────────────────

function printSingle(m: MetricResult): void {
  const tag = m.score === 1 ? 'PASS' : 'FAIL';
  console.log(`  [${m.mode.toUpperCase().padEnd(4)}] ${tag} ${m.name.padEnd(28)} | expected: ${m.expected}`);
  if (m.score === 0) {
    console.log(`                                   | actual:   ${m.actual}`);
  }
}

const ALL_METRICS = [
  metricSoloSingleCall(),
  metricDuoSynthesisQuality(),
  metricDuoDeterministicPath(),
  metricDuoCost(),
  metricTrioFullGate(),
  metricTrioIsolation(),
  metricTrioCost(),
  metricTrioRoleSynthesis(),
];

describe('Deliberation benchmark — individual metrics', () => {
  it('Solo: Single call', async () => { const m = await metricSoloSingleCall(); printSingle(m); expect(m.score).toBe(1); });
  it('Duo: Synthesis quality', async () => { const m = await metricDuoSynthesisQuality(); printSingle(m); expect(m.score).toBe(1); });
  it('Duo: Deterministic path', async () => { const m = await metricDuoDeterministicPath(); printSingle(m); expect(m.score).toBe(1); });
  it('Duo: Cost', async () => { const m = await metricDuoCost(); printSingle(m); expect(m.score).toBe(1); });
  it('Trio: Full gate', async () => { const m = await metricTrioFullGate(); printSingle(m); expect(m.score).toBe(1); });
  it('Trio: Isolation', async () => { const m = await metricTrioIsolation(); printSingle(m); expect(m.score).toBe(1); });
  it('Trio: Cost', async () => { const m = await metricTrioCost(); printSingle(m); expect(m.score).toBe(1); });
  it('Trio: Role-based synthesis', async () => { const m = await metricTrioRoleSynthesis(); printSingle(m); expect(m.score).toBe(1); });
});

describe('Deliberation benchmark — combined parity report', () => {
  it('compares solo vs duo vs trio (≥6/8 = 75%)', async () => {
    const metrics = await Promise.all(ALL_METRICS);

    const passed = metrics.reduce((s, m) => s + m.score, 0);
    const total = metrics.length;
    const threshold = Math.ceil(total * 0.75);
    const status = passed >= total ? 'PARITY' : passed >= threshold ? 'APPROACHING' : 'FAR';

    const byMode = {
      solo: metrics.filter((m) => m.mode === 'solo'),
      duo: metrics.filter((m) => m.mode === 'duo'),
      trio: metrics.filter((m) => m.mode === 'trio'),
    };
    const modeSummary = (label: string, items: MetricResult[]) => {
      const p = items.reduce((s, m) => s + m.score, 0);
      return `${label}: ${p}/${items.length}`;
    };
    const scoreRow = metrics.map((m) => `${m.name}=${m.score}`).join('  ');

    const table = [
      '',
      '╔══════════════════════════════════════════════════════════════════════════════╗',
      '║   DELIBERATION BENCHMARK — solo vs duo vs trio parity                       ║',
      '╠══════════════════════════════════════════════════════════════════════════════╣',
      `║  Total: ${String(passed).padStart(2)}/${total}   Parity threshold: ≥${threshold}/${total} (75%)                     ║`,
      `║  Status: ${status.padEnd(12)}   Gap: ${total - passed}                                             ║`,
      '╠══════════════════════════════════════════════════════════════════════════════╣',
      `║  ${modeSummary('Solo', byMode.solo).padEnd(74)} ║`,
      `║  ${modeSummary('Duo', byMode.duo).padEnd(74)} ║`,
      `║  ${modeSummary('Trio', byMode.trio).padEnd(74)} ║`,
      '╠══════════════════════════════════════════════════════════════════════════════╣',
      `║  ${scoreRow.slice(0, 74).padEnd(74)} ║`,
      '╚══════════════════════════════════════════════════════════════════════════════╝',
      '',
    ].join('\n');

    console.log(table);
    expect(passed).toBeGreaterThanOrEqual(threshold);
  });
});
