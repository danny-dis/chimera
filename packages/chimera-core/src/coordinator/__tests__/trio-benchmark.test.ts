/**
 * Virtual trio benchmark.
 *
 * Mirrors `fusion-benchmark.test.ts` for the trio executor. 4 metrics
 * derived from the trio design (see `research/trio-duo-solo-improvement-plan.md`).
 * "Parity" for trio = the executor's 4-stage quality gate is real (not a
 * stub) and has the same safety nets as the fusion executor.
 *
 * Run with:
 *   npx vitest run src/coordinator/__tests__/trio-benchmark.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { TrioExecutor } from '../trio-executor.js';
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
}

const MOCK_IDS = {
  writer: 'mock/trio-bench-writer',
  reviewer: 'mock/trio-bench-reviewer',
  challenger: 'mock/trio-bench-challenger',
} as const;

/**
 * Model ids used by the role-based synthesis metric. The response
 * synthesizer's role-authority map keys off the FIRST segment of the
 * agent id (split on '-'), so we use bare role names to make the
 * reviewer-wins resolution actually take effect.
 */
const ROLE_IDS = {
  writer: 'writer',
  reviewer: 'reviewer',
  challenger: 'challenger',
} as const;

const FRONTIER_MODEL_ID = 'anthropic/claude-opus-4';
const MOCK_WORKTREE_PATH = '/tmp/trio-mock-worktree';

function makeMockProvider(responses: Array<{ match: string | RegExp; content: string; tokens?: number }>): LLMProvider {
  return {
    complete: vi.fn().mockImplementation(async (messages) => {
      const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
      for (const r of responses) {
        const match = typeof r.match === 'string' ? userMsg.includes(r.match) : r.match.test(userMsg);
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
    id: MOCK_IDS.writer, name: 'Mock Trio Writer', provider: 'mock',
    contextWindow: 8192, maxOutputTokens: 1024,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
    capabilities: { toolCalling: false, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
    degradationThreshold: 0.5, tier: 'cheap',
  };
  for (const id of Object.values(MOCK_IDS)) {
    if (!internal.models.has(id)) internal.models.set(id, { ...mockEntry, id, name: id });
  }
  if (!internal.models.has(FRONTIER_MODEL_ID)) internal.models.set(FRONTIER_MODEL_ID, { id: FRONTIER_MODEL_ID, name: 'Claude Opus 4', provider: 'anthropic', contextWindow: 200000, maxOutputTokens: 8192, pricing: { inputPerMillion: 15, outputPerMillion: 75 }, capabilities: { toolCalling: true, structuredOutput: true, vision: true, reasoning: true, parallelToolCalls: true }, degradationThreshold: 0.6, tier: 'frontier' });
  return reg;
}

/**
 * Mock `WorktreeIsolation` — returns a fake `WorktreeInfo` from
 * `createIsolatedWorktree` so the trio executor can run its isolation
 * path without actually creating a git worktree (which would require
 * a real git repo and slow down tests).
 */
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

// ── Metrics ─────────────────────────────────────────────────────────

async function metricFullGate(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const executor = new TrioExecutor({ eventStream, registry });

  const writerFactory = () => makeMockProvider([{ match: 'You are the writer', content: 'writer draft' }]);
  const reviewerFactory = () => makeMockProvider([{ match: 'You are the reviewer', content: JSON.stringify({ verdict: 'pass', issues: [], commentary: 'ok' }) }]);
  const challengerFactory = () => makeMockProvider([{ match: 'You are the challenger', content: JSON.stringify({ challenges: [], alternatives: [] }) }]);

  const factory = (id: string) => {
    if (id === MOCK_IDS.writer) return writerFactory();
    if (id === MOCK_IDS.reviewer) return reviewerFactory();
    if (id === MOCK_IDS.challenger) return challengerFactory();
    throw new Error(`unknown: ${id}`);
  };

  const result = await executor.executeWithAnalysis(
    'test',
    { writer: MOCK_IDS.writer, reviewer: MOCK_IDS.reviewer, challenger: MOCK_IDS.challenger, temperature: 0 },
    factory
  );

  const allStagesRan = result.stages.length === 3;
  const outputNonEmpty = result.output.length > 0;
  const analysisConfidenceSet = result.analysis.confidence !== undefined;
  const notDegraded = !result.degraded;
  const score: Score = (allStagesRan && outputNonEmpty && analysisConfidenceSet && notDegraded) ? 1 : 0;
  return {
    name: 'Full gate',
    score,
    expected: '3 stages, non-empty output, analysis.confidence set, not degraded',
    actual: `stages=${result.stages.length}, output="${result.output}", confidence=${result.analysis.confidence}, degraded=${result.degraded}`,
  };
}

async function metricIsolation(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const worktreeIsolation = makeMockWorktreeIsolation();
  const executor = new TrioExecutor({ eventStream, registry, worktreeIsolation });

  const writerFactory = () => makeMockProvider([{ match: 'You are the writer', content: 'isolated draft' }]);
  const reviewerFactory = () => makeMockProvider([{ match: 'You are the reviewer', content: JSON.stringify({ verdict: 'pass', issues: [], commentary: 'ok' }) }]);
  const challengerFactory = () => makeMockProvider([{ match: 'You are the challenger', content: JSON.stringify({ challenges: [], alternatives: [] }) }]);

  const factory = (id: string) => {
    if (id === MOCK_IDS.writer) return writerFactory();
    if (id === MOCK_IDS.reviewer) return reviewerFactory();
    if (id === MOCK_IDS.challenger) return challengerFactory();
    throw new Error(`unknown: ${id}`);
  };

  const result = await executor.executeWithAnalysis(
    'test',
    {
      writer: MOCK_IDS.writer,
      reviewer: MOCK_IDS.reviewer,
      challenger: MOCK_IDS.challenger,
      temperature: 0,
      isolateWorktree: true,
    },
    factory
  );

  // Cast to access the mock's call history.
  const mock = worktreeIsolation as unknown as {
    createIsolatedWorktree: { mock: { calls: unknown[] } };
  };
  const createCalls = mock.createIsolatedWorktree.mock.calls.length;
  const score: Score = (
    !result.degraded &&
    result.worktreePath === MOCK_WORKTREE_PATH &&
    createCalls === 1
  ) ? 1 : 0;
  return {
    name: 'Isolation',
    score,
    expected: `not degraded, worktreePath="${MOCK_WORKTREE_PATH}", createIsolatedWorktree called exactly once`,
    actual: `degraded=${result.degraded}, worktreePath="${result.worktreePath ?? ''}", createCalls=${createCalls}`,
  };
}

async function metricCost(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const costTracker = new CostTracker(eventStream);
  const executor = new TrioExecutor({ eventStream, registry, costTracker });
  const recordSpendSpy = vi.spyOn(costTracker, 'recordSpend');

  // Frontier writer costs ~$0.00525/call. Budget $0.001 trips after the
  // draft stage, so `recordSpend` must have fired before the degradation.
  const factory = (id: string) => {
    if (id === MOCK_IDS.challenger) return makeMockProvider([{ match: /./, content: 'challenge' }]);
    if (id === FRONTIER_MODEL_ID) return makeMockProvider([{ match: /./, content: 'content' }]);
    throw new Error(`unknown: ${id}`);
  };

  const result = await executor.executeWithAnalysis(
    'test',
    { writer: FRONTIER_MODEL_ID, reviewer: FRONTIER_MODEL_ID, challenger: MOCK_IDS.challenger,
      budgetUsd: 0.001, temperature: 0 },
    factory
  );

  const budgetTripped = result.degraded && /budget/i.test(result.degradationReason ?? '');
  const spentOnFrontier = recordSpendSpy.mock.calls.some((c) => c[0] === FRONTIER_MODEL_ID);
  const totalSpend = costTracker.getTotalCost();

  const score: Score = (budgetTripped && spentOnFrontier && totalSpend > 0) ? 1 : 0;
  return {
    name: 'Cost',
    score,
    expected: 'recordSpend fires for the frontier writer, total cost > 0, then low budget trips degraded',
    actual: `degraded=${result.degraded}, reason="${result.degradationReason}", recordSpendCalls=${recordSpendSpy.mock.calls.length}, totalCost=${totalSpend}`,
  };
}

async function metricRoleSynthesis(): Promise<MetricResult> {
  const eventStream = new EventStream();
  const registry = makeRegistry();
  const executor = new TrioExecutor({ eventStream, registry });

  // The writer and reviewer must contradict on a shared topic with
  // negation asymmetry (one says "use X", the other says "don't use X").
  // The synthesizer's `hasOppositeSentiment` requires shared tokens
  // (jaccard > 0.2) AND asymmetric negation — this pair triggers that.
  const writerFactory = () => makeMockProvider([
    { match: 'You are a code writer', content: 'use caching for performance optimization' },
  ]);
  const reviewerFactory = () => makeMockProvider([
    { match: 'You are a code reviewer', content: 'do not use caching for performance optimization' },
  ]);
  const challengerFactory = () => makeMockProvider([
    { match: 'You are the challenger', content: JSON.stringify({ challenges: ['consider invalidation cost'], alternatives: [] }) },
  ]);

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

  // 1. All 3 stages must have run with the right roles.
  const roles = result.stages.map((s) => s.role);
  const rolesCorrect = roles[0] === 'writer' && roles[1] === 'reviewer' && roles[2] === 'challenger';

  // 2. The 5-field analysis must record a contradiction conflict.
  const conflicts = result.analysis.conflicts ?? [];
  const hasContradiction = conflicts.some((c) => /contradiction|opposing/i.test(c));

  // 3. The resolved output must cite role authority and identify
  //    the reviewer as the winner (writer authority=1 < reviewer=3).
  const outputLower = result.output.toLowerCase();
  const mentionsRoleAuthority = /role\s+authority/.test(outputLower);
  const reviewerWins = /reviewer[\s\S]*overrides[\s\S]*writer|role\s+authority[\s\S]*reviewer/i.test(outputLower);

  const score: Score = (rolesCorrect && hasContradiction && mentionsRoleAuthority && reviewerWins && !result.degraded) ? 1 : 0;
  return {
    name: 'Role-based synthesis',
    score,
    expected: 'roles=[writer,reviewer,challenger], contradiction conflict in analysis, output cites role authority with reviewer overriding writer',
    actual: `roles=[${roles.join(',')}], conflicts=${JSON.stringify(conflicts)}, output="${result.output.slice(0, 200)}"`,
  };
}

// ── Runner ──────────────────────────────────────────────────────────

const TRIO_REFERENCE: Record<string, 1> = {
  'Full gate': 1,
  'Isolation': 1,
  'Cost': 1,
  'Role-based synthesis': 1,
};

function summarize(metrics: MetricResult[]): { trio: number; reference: number; delta: number; status: 'parity' | 'approaching' | 'far'; table: string } {
  const trio = metrics.reduce((s, m) => s + m.score, 0);
  const reference = metrics.length;
  const delta = reference - trio;
  const status: 'parity' | 'approaching' | 'far' =
    delta === 0 ? 'parity' : delta <= 1 ? 'approaching' : 'far';
  const scoreRow = metrics.map((m) => `${m.name}=${m.score}/${TRIO_REFERENCE[m.name]}`).join('  ');
  const table = [
    '',
    '╔══════════════════════════════════════════════════════════════════╗',
    '║         TRIO BENCHMARK — chimera trio quality gate              ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  Chimera trio: ${String(trio).padStart(2)}/${reference} (4-stage gate is real)                       ║`,
    `║  Reference:    ${reference}/${reference} (all 4 metrics pass)                            ║`,
    `║  Gap: ${delta}   Status: ${status.toUpperCase().padEnd(10)}                                    ║`,
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  ${scoreRow.slice(0, 64).padEnd(64)} ║`,
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
  ].join('\n');
  return { trio, reference, delta, status, table };
}

function printSingle(m: MetricResult): void {
  const tag = m.score === 1 ? 'PASS' : 'FAIL';
  console.log(`  ${tag} ${m.name.padEnd(28)} | expected: ${m.expected}`);
  if (m.score === 0) {
    console.log(`                               | actual:   ${m.actual}`);
  }
}

describe('Trio benchmark — individual metrics', () => {
  it('Full gate', async () => { const m = await metricFullGate(); printSingle(m); expect(m.score).toBe(1); });
  it('Isolation', async () => { const m = await metricIsolation(); printSingle(m); expect(m.score).toBe(1); });
  it('Cost', async () => { const m = await metricCost(); printSingle(m); expect(m.score).toBe(1); });
  it('Role-based synthesis', async () => { const m = await metricRoleSynthesis(); printSingle(m); expect(m.score).toBe(1); });
});

describe('Trio benchmark — full report', () => {
  it('produces a parity report', async () => {
    const metrics = await Promise.all([
      metricFullGate(),
      metricIsolation(),
      metricCost(),
      metricRoleSynthesis(),
    ]);
    const summary = summarize(metrics);
    console.log(summary.table);
    // Parity threshold: ≥3/4
    expect(summary.trio).toBeGreaterThanOrEqual(3);
  });
});
