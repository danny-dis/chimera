/**
 * Combined benchmark — solo + duo + trio parity report.
 *
 * Runs all 8 metrics across the three execution modes and prints a
 * unified table. Parity threshold: ≥ 6/8 (75%).
 *
 * Run with:
 *   npx vitest run src/coordinator/__tests__/combined-benchmark.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { SoloExecutor } from '../solo-executor.js';
import { DuoExecutor } from '../duo-executor.js';
import { TrioExecutor } from '../trio-executor.js';
import { ResponseSynthesizer } from '../../response-synthesizer.js';
import { ModelRegistry } from '../../../../chimera-providers/src/model-registry.js';
import { EventStream } from '../../event-stream.js';
import type { LLMProvider } from '../../session-orchestrator.js';
import type { ModelEntry } from '../../../../chimera-providers/src/model-registry.js';
import type { WorktreeIsolation, WorktreeInfo } from '../../agent/worktree-isolation.js';

type Score = 0 | 1;

interface MetricResult {
  name: string;
  score: Score;
  expected: string;
  actual: string;
  mode: 'solo' | 'duo' | 'trio';
}

// ── Mock infrastructure ─────────────────────────────────────────────

const MOCK_IDS_SOLO = { solo: 'mock/combined-solo' };
const MOCK_IDS_DUO = { writer: 'mock/combined-duo-writer', reviewer: 'mock/combined-duo-reviewer' };
const MOCK_IDS_TRIO = { writer: 'mock/combined-trio-writer', reviewer: 'mock/combined-trio-reviewer', challenger: 'mock/combined-trio-challenger' };
const ROLE_IDS = { writer: 'writer', reviewer: 'reviewer', challenger: 'challenger' };
const FRONTIER_MODEL_ID = 'anthropic/claude-opus-4';
const MOCK_WORKTREE_PATH = '/tmp/combined-mock-worktree';

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
    id: MOCK_IDS_SOLO.solo, name: 'Mock Combined', provider: 'mock',
    contextWindow: 8192, maxOutputTokens: 1024,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
    capabilities: { toolCalling: false, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
    degradationThreshold: 0.5, tier: 'cheap',
  };
  for (const id of [...Object.values(MOCK_IDS_SOLO), ...Object.values(MOCK_IDS_DUO), ...Object.values(MOCK_IDS_TRIO)]) {
    if (!internal.models.has(id)) internal.models.set(id, { ...mockEntry, id, name: id });
  }
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

// ── Solo metrics (1) ────────────────────────────────────────────────

async function metricSoloSingleCall(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const executor = new SoloExecutor({ eventStream, registry });
  const provider = makeMockProvider([{ match: /./, content: 'SOLO_OUTPUT' }]);
  const factory = (_id: string) => provider;

  const result = await executor.executeWithAnalysis(
    'test',
    { model: MOCK_IDS_SOLO.solo, temperature: 0, selfVerify: false },
    factory
  );

  const completeFn = provider.complete as unknown as { mock: { calls: unknown[] } };
  const callCount = completeFn.mock.calls.length;
  const singleCall = callCount === 1;
  const outputMatches = result.output === 'SOLO_OUTPUT';
  const notDegraded = !result.degraded;
  const analysisShapeCorrect =
    result.analysis.finalResponse === 'SOLO_OUTPUT' &&
    Array.isArray(result.analysis.consensus) && result.analysis.consensus.length === 0 &&
    Array.isArray(result.analysis.conflicts) && result.analysis.conflicts.length === 0 &&
    Array.isArray(result.analysis.uniqueInsights) && result.analysis.uniqueInsights.length === 0 &&
    Array.isArray(result.analysis.blindSpots) && result.analysis.blindSpots.length === 0 &&
    result.analysis.confidence === 0.8;
  const score: Score = (singleCall && outputMatches && notDegraded && analysisShapeCorrect) ? 1 : 0;
  return {
    name: 'Single call', mode: 'solo', score,
    expected: 'exactly 1 LLM call, output="SOLO_OUTPUT", not degraded, 5-field shape',
    actual: `calls=${callCount}, output="${result.output}", degraded=${result.degraded}, confidence=${result.analysis.confidence}`,
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
    expected: 'role authority resolves contradiction, reviewer overrides writer',
    actual: `mentionsRoleAuthority=${mentionsRoleAuthority}, reviewerWins=${reviewerWins}, escalated=${notEscalated}`,
  };
}

async function metricDuoDegradedFallback(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const executor = new DuoExecutor({ eventStream, registry });

  const writerFactory = () => makeMockProvider([{ match: /./, content: 'writer output' }]);
  const brokenReviewerFactory = () => ({
    complete: vi.fn().mockRejectedValue(new Error('model unavailable')),
  } as unknown as LLMProvider);

  const factory = (id: string) => {
    if (id === MOCK_IDS_DUO.writer) return writerFactory();
    if (id === MOCK_IDS_DUO.reviewer) return brokenReviewerFactory();
    throw new Error(`unknown: ${id}`);
  };

  const result = await executor.executeWithAnalysis(
    'test',
    { modelA: MOCK_IDS_DUO.writer, modelB: MOCK_IDS_DUO.reviewer, temperature: 0 },
    factory
  );

  const score: Score = (result.degraded && result.degradationReason !== undefined) ? 1 : 0;
  return {
    name: 'Degraded fallback', mode: 'duo', score,
    expected: 'degraded=true with defined degradationReason when Model B throws',
    actual: `degraded=${result.degraded}, reason="${result.degradationReason}"`,
  };
}

async function metricDuoCostEnforcement(): Promise<MetricResult> {
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
    name: 'Cost enforcement', mode: 'duo', score,
    expected: 'degraded=true with reason matching /budget/i',
    actual: `degraded=${result.degraded}, reason="${result.degradationReason}"`,
  };
}

// ── Trio metrics (4) ────────────────────────────────────────────────

async function metricTrioFullGate(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const executor = new TrioExecutor({ eventStream, registry });

  const writerFactory = () => makeMockProvider([{ match: 'You are the writer', content: 'writer draft' }]);
  const reviewerFactory = () => makeMockProvider([{ match: 'You are the reviewer', content: JSON.stringify({ verdict: 'pass', issues: [], commentary: 'ok' }) }]);
  const challengerFactory = () => makeMockProvider([{ match: 'You are the challenger', content: JSON.stringify({ challenges: [], alternatives: [] }) }]);
  const factory = (id: string) => {
    if (id === MOCK_IDS_TRIO.writer) return writerFactory();
    if (id === MOCK_IDS_TRIO.reviewer) return reviewerFactory();
    if (id === MOCK_IDS_TRIO.challenger) return challengerFactory();
    throw new Error(`unknown: ${id}`);
  };

  const result = await executor.executeWithAnalysis(
    'test',
    { writer: MOCK_IDS_TRIO.writer, reviewer: MOCK_IDS_TRIO.reviewer, challenger: MOCK_IDS_TRIO.challenger, temperature: 0 },
    factory
  );

  const allStagesRan = result.stages.length === 3;
  const outputNonEmpty = result.output.length > 0;
  const analysisConfidenceSet = result.analysis.confidence !== undefined;
  const notDegraded = !result.degraded;
  const score: Score = (allStagesRan && outputNonEmpty && analysisConfidenceSet && notDegraded) ? 1 : 0;
  return {
    name: 'Full gate', mode: 'trio', score,
    expected: '3 stages, non-empty output, confidence set, not degraded',
    actual: `stages=${result.stages.length}, output="${result.output.slice(0, 50)}", confidence=${result.analysis.confidence}, degraded=${result.degraded}`,
  };
}

async function metricTrioIsolation(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const worktreeIsolation = makeMockWorktreeIsolation();
  const executor = new TrioExecutor({ eventStream, registry, worktreeIsolation });

  const writerFactory = () => makeMockProvider([{ match: 'You are the writer', content: 'isolated draft' }]);
  const reviewerFactory = () => makeMockProvider([{ match: 'You are the reviewer', content: JSON.stringify({ verdict: 'pass', issues: [], commentary: 'ok' }) }]);
  const challengerFactory = () => makeMockProvider([{ match: 'You are the challenger', content: JSON.stringify({ challenges: [], alternatives: [] }) }]);
  const factory = (id: string) => {
    if (id === MOCK_IDS_TRIO.writer) return writerFactory();
    if (id === MOCK_IDS_TRIO.reviewer) return reviewerFactory();
    if (id === MOCK_IDS_TRIO.challenger) return challengerFactory();
    throw new Error(`unknown: ${id}`);
  };

  const result = await executor.executeWithAnalysis(
    'test',
    { writer: MOCK_IDS_TRIO.writer, reviewer: MOCK_IDS_TRIO.reviewer, challenger: MOCK_IDS_TRIO.challenger, temperature: 0, isolateWorktree: true },
    factory
  );

  const mock = worktreeIsolation as unknown as { createIsolatedWorktree: { mock: { calls: unknown[] } } };
  const createCalls = mock.createIsolatedWorktree.mock.calls.length;
  const score: Score = (!result.degraded && result.worktreePath === MOCK_WORKTREE_PATH && createCalls === 1) ? 1 : 0;
  return {
    name: 'Isolation', mode: 'trio', score,
    expected: `not degraded, worktreePath="${MOCK_WORKTREE_PATH}", createIsolatedWorktree called once`,
    actual: `degraded=${result.degraded}, worktreePath="${result.worktreePath ?? ''}", createCalls=${createCalls}`,
  };
}

async function metricTrioCost(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const executor = new TrioExecutor({ eventStream, registry });

  const factory = (id: string) => {
    if (id === MOCK_IDS_TRIO.challenger) return makeMockProvider([{ match: /./, content: 'challenge' }]);
    if (id === FRONTIER_MODEL_ID) return makeMockProvider([{ match: /./, content: 'content' }]);
    throw new Error(`unknown: ${id}`);
  };

  const result = await executor.executeWithAnalysis(
    'test',
    { writer: FRONTIER_MODEL_ID, reviewer: FRONTIER_MODEL_ID, challenger: MOCK_IDS_TRIO.challenger, budgetUsd: 0.001, temperature: 0 },
    factory
  );

  const score: Score = (result.degraded && /budget/i.test(result.degradationReason ?? '')) ? 1 : 0;
  return {
    name: 'Trio cost', mode: 'trio', score,
    expected: 'degraded=true with reason matching /budget/i',
    actual: `degraded=${result.degraded}, reason="${result.degradationReason}"`,
  };
}

async function metricTrioRoleSynthesis(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const executor = new TrioExecutor({ eventStream, registry });

  const writerFactory = () => makeMockProvider([{ match: 'You are a code writer', content: 'use caching for performance optimization' }]);
  const reviewerFactory = () => makeMockProvider([{ match: 'You are a code reviewer', content: 'do not use caching for performance optimization' }]);
  const challengerFactory = () => makeMockProvider([{ match: 'You are the challenger', content: JSON.stringify({ challenges: ['consider invalidation cost'], alternatives: [] }) }]);
  const factory = (id: string) => {
    if (id === ROLE_IDS.writer) return writerFactory();
    if (id === ROLE_IDS.reviewer) return reviewerFactory();
    if (id === ROLE_IDS.challenger) return challengerFactory();
    throw new Error(`unknown: ${id}`);
  };

  const result = await executor.executeWithAnalysis(
    'test',
    { writer: ROLE_IDS.writer, reviewer: ROLE_IDS.reviewer, challenger: ROLE_IDS.challenger, temperature: 0 },
    factory
  );

  const roles = result.stages.map((s) => s.role);
  const rolesCorrect = roles[0] === 'writer' && roles[1] === 'reviewer' && roles[2] === 'challenger';
  const conflicts = result.analysis.conflicts ?? [];
  const hasContradiction = conflicts.some((c) => /contradiction|opposing/i.test(c));
  const outputLower = result.output.toLowerCase();
  const mentionsRoleAuthority = /role\s+authority/.test(outputLower);
  const reviewerWins = /reviewer[\s\S]*overrides[\s\S]*writer|role\s+authority[\s\S]*reviewer/i.test(outputLower);
  const score: Score = (rolesCorrect && hasContradiction && mentionsRoleAuthority && reviewerWins && !result.degraded) ? 1 : 0;
  return {
    name: 'Role-based synthesis', mode: 'trio', score,
    expected: '3 roles, contradiction conflict, output cites role authority with reviewer overriding writer',
    actual: `roles=[${roles.join(',')}], conflicts=${JSON.stringify(conflicts.map((c) => c.type))}, mentionsRA=${mentionsRoleAuthority}, reviewerWins=${reviewerWins}`,
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

describe('Combined benchmark — individual metrics', () => {
  it('Solo: Single call', async () => { const m = await metricSoloSingleCall(); printSingle(m); expect(m.score).toBe(1); });
  it('Duo: Synthesis quality', async () => { const m = await metricDuoSynthesisQuality(); printSingle(m); expect(m.score).toBe(1); });
  it('Duo: Degraded fallback', async () => { const m = await metricDuoDegradedFallback(); printSingle(m); expect(m.score).toBe(1); });
  it('Duo: Cost enforcement', async () => { const m = await metricDuoCostEnforcement(); printSingle(m); expect(m.score).toBe(1); });
  it('Trio: Full gate', async () => { const m = await metricTrioFullGate(); printSingle(m); expect(m.score).toBe(1); });
  it('Trio: Isolation', async () => { const m = await metricTrioIsolation(); printSingle(m); expect(m.score).toBe(1); });
  it('Trio: Cost', async () => { const m = await metricTrioCost(); printSingle(m); expect(m.score).toBe(1); });
  it('Trio: Role-based synthesis', async () => { const m = await metricTrioRoleSynthesis(); printSingle(m); expect(m.score).toBe(1); });
});

describe('Combined benchmark — full parity report', () => {
  it('produces combined report (≥6/8 = 75%)', async () => {
    const metrics = await Promise.all([
      metricSoloSingleCall(),
      metricDuoSynthesisQuality(),
      metricDuoDegradedFallback(),
      metricDuoCostEnforcement(),
      metricTrioFullGate(),
      metricTrioIsolation(),
      metricTrioCost(),
      metricTrioRoleSynthesis(),
    ]);

    const passed = metrics.reduce((s, m) => s + m.score, 0);
    const total = metrics.length;
    const threshold = Math.ceil(total * 0.75);
    const delta = total - passed;
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
      '╔══════════════════════════════════════════════════════════════════════════╗',
      '║           COMBINED BENCHMARK — chimera multi-mode parity               ║',
      '╠══════════════════════════════════════════════════════════════════════════╣',
      `║  Total: ${String(passed).padStart(2)}/${total}   Parity threshold: ≥${threshold}/${total} (75%)                   ║`,
      `║  Status: ${status.padEnd(12)}   Gap: ${delta}                                           ║`,
      '╠══════════════════════════════════════════════════════════════════════════╣',
      `║  ${modeSummary('Solo', byMode.solo).padEnd(72)} ║`,
      `║  ${modeSummary('Duo', byMode.duo).padEnd(72)} ║`,
      `║  ${modeSummary('Trio', byMode.trio).padEnd(72)} ║`,
      '╠══════════════════════════════════════════════════════════════════════════╣',
      `║  ${scoreRow.slice(0, 72).padEnd(72)} ║`,
      '╚══════════════════════════════════════════════════════════════════════════╝',
      '',
    ].join('\n');

    console.log(table);

    // Parity threshold: ≥6/8 (75%)
    expect(passed).toBeGreaterThanOrEqual(threshold);
  });
});
