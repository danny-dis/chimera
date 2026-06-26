# Unified `DeliberationEngine` — Design

> Companion to `research/fusion-router-comparison.md`. The comparison identified
> 5 overlapping consensus systems; this document proposes one engine that
> unifies them and a migration plan for each.

---

## 1. Problem statement

Chimera has 5 different "ask N models, synthesize 1, expose disagreements" pipelines. They were built at different times for different surfaces and never unified:

| # | System | File:line | Topology | Synthesis |
|---|---|---|---|---|
| 1 | `FusionExecutor` | `chimera/packages/chimera-core/src/coordinator/fusion-executor.ts:11` | N parallel + 1 judge | LLM judge, `JSON.parse` unguarded |
| 2 | `ResponseSynthesizer` | `chimera/packages/chimera-core/src/response-synthesizer.ts:65` | role-tagged (writer/reviewer/challenger) | deterministic — Jaccard + `hasOppositeSentiment` + `ROLE_AUTHORITY` table |
| 3 | `ResultAggregator` | `chimera/packages/chimera-core/src/coordinator/result-aggregator.ts:31` | sub-task outputs → 1 | LLM merge via `MERGE_PROMPT` |
| 4 | `CoordinatorEngine` | `chimera/packages/chimera-core/src/coordinator/coordinator-engine.ts:18` | decompose → spawn → aggregate | consumes #3 |
| 5 | `AgentMesh.executeQualityGate` | `chimera/packages/chimera-core/src/agent-mesh.ts:50` | draft → verify → challenge → synthesize | currently a stub at `agent-mesh.ts:71-83` |

The `OrchestrationPattern` type (`chimera/packages/chimera-core/src/types/agent.ts:5`) is already `'duo' | 'trio' | 'fusion' | 'solo'` — the type system is ahead of the runtime.

### Cost of the sprawl
- **No shared cost guard.** Only `CostTracker` (`cost-tracker.ts:7`) tracks spend, and the 5 systems ignore it.
- **No shared recursion guard.** Each system could re-invoke any of the others.
- **No shared event contract.** `fusion-executor.ts:42` emits `fusion_provider_error` — a type that doesn't exist in `types/events.ts:3-144`.
- **No shared analysis schema.** OpenRouter's 5-field shape (`consensus, contradictions, coverage gaps, unique insights, blind spots`) is the right contract; chimera's 4 (`thought, final_response, consensus, conflicts`) leaves `uniqueInsights` and `blindSpots` on the floor.

---

## 2. Proposed interface

```ts
// chimera/packages/chimera-core/src/deliberation/types.ts (NEW)

import type { LLMProvider } from '../session-orchestrator.js';

/** Named topology presets. Mirrors OrchestrationPattern but is engine-internal. */
export type DeliberationPreset = 'solo' | 'duo' | 'trio' | 'fusion' | 'merge';

/** A single panel member. Resolved to a provider via the factory at call time. */
export interface PanelMember {
  /** Model id (resolved through ModelRegistry). */
  modelId: string;
  /** Optional role hint — drives the system prompt template. */
  role?: 'writer' | 'reviewer' | 'challenger' | 'planner' | 'researcher';
  /** Optional human-readable label for the event stream. */
  label?: string;
}

/** 5-field structured analysis — matches OpenRouter's contract. */
export interface FusionAnalysis {
  thought: string;
  finalResponse: string;
  consensus: string[];
  conflicts: string[];
  uniqueInsights: string[];
  blindSpots: string[];
  /** Judge's self-reported confidence in [0, 1]. */
  confidence: number;
}

/** Configuration for a single deliberation. Modeled on OpenRouter's Fusion Router config. */
export interface DeliberationConfig {
  preset: DeliberationPreset;
  /** Panel members. `solo`/`merge` may have just 1. 1–8 for `fusion`. */
  panel: PanelMember[];
  /** Judge model. Defaults to the strongest panel member. */
  judgeModelId?: string;
  /** If true, run even when the request looks simple (OpenRouter's tool_choice:"required"). */
  forceInvocation?: boolean;
  /** Sampling temperature forwarded to every inner LLM call. */
  temperature?: number;
  /** Per-inner-call output token cap. Critical for reasoning-heavy models. */
  maxCompletionTokens?: number;
  /** Per-inner-call tool loop cap. 1–16. */
  maxToolCalls?: number;
  /** Reasoning config forwarded to inner calls. */
  reasoning?: { effort?: 'low' | 'medium' | 'high'; maxTokens?: number };
  /** Web search/fetch for inner calls (panel + judge). */
  webSearch?: boolean;
  webFetch?: boolean;
  /** Max fusion depth. Default 1 (OpenRouter's behavior). */
  maxDepth?: number;
  /** Soft cap on input to the judge (chars). Surpassing truncates with a marker. */
  maxJudgeContextChars?: number;
  /** Judge failover chain: tried in order, first that succeeds wins. */
  judgeFailover?: string[];
  /** USD budget. Triggers a `cost_alert` and graceful degradation. */
  budgetUsd?: number;
  /** Function that resolves a model id to an LLMProvider. */
  providerFactory: (modelId: string) => LLMProvider;
}

export interface DeliberationRequest {
  task: string;
  context?: string;
  config: DeliberationConfig;
}

export interface DeliberationResult {
  output: string;
  conflicts: Array<{
    subTaskIds?: string[];
    type: 'contradiction' | 'overlap' | 'gap' | 'preference';
    description: string;
    resolution?: string;
    resolvedBy: 'role_authority' | 'confidence' | 'user_escalation' | 'judge' | 'cost_guard';
  }>;
  analysis?: Partial<FusionAnalysis>;
  sources: Array<{ modelId: string; role?: string; content: string; tokens: number; durationMs: number }>;
  overallConfidence: number;
  needsUserEscalation: boolean;
  totalCostUsd: number;
  presetUsed: DeliberationPreset;
  /** False if at least one panel member failed. Caller decides whether to retry. */
  allSucceeded: boolean;
  durationMs: number;
}
```

---

## 3. Preset mapping

| Preset | Topology | Synthesis mode | Replaces |
|---|---|---|---|
| `solo` | 1 model, no judge | direct return | default `SessionOrchestrator` paths |
| `duo` | 2 models, no judge | deterministic — delegates to `ResponseSynthesizer.synthesize` | `AgentMesh.executeQualityGate` with no challenger |
| `trio` | 3 models (writer/reviewer/challenger), no judge | deterministic — delegates to `ResponseSynthesizer.synthesize` | `AgentMesh.executeQualityGate` with challenger |
| `fusion` | 1–8 panel + 1 judge | LLM judge with 5-field structured analysis | `FusionExecutor` |
| `merge` | N sub-task outputs → 1 | LLM merge with deterministic fallback | `ResultAggregator.aggregate` |

`CoordinatorEngine` is **not** a preset — it is a higher-level orchestrator that decomposes a task and calls the engine once per merge step. The decomposition step stays in `CoordinatorEngine`; the merge delegates to the engine with `preset: 'merge'` (`coordinator-engine.ts:32` and `:75` are the two call sites to migrate).

---

## 4. Migration plan

### 4.1 `FusionExecutor` → `DeliberationEngine.run(preset: 'fusion')`
- **State that moves in:** the panel-resolve logic, the mask-before-judge logic (now gated by `maxJudgeContextChars`), the `JSON.parse` (now wrapped in try/catch with degraded fallback).
- **State that stays out:** the 500-char hard mask is replaced by a soft cap with a `[truncated]` marker.
- **Disposition:** wrap-then-delete. Ship a `FusionExecutor` thin shim that calls `engine.run(...)` for one minor version, then remove. The orphan test at `coordinator/__tests__/fusion-executor.test.ts:11` becomes a test against `DeliberationEngine.run(preset: 'fusion')`.

### 4.2 `ResponseSynthesizer` → `DeliberationEngine.run(preset: 'duo' | 'trio')`
- **State that moves in:** the Jaccard + `hasOppositeSentiment` + `ROLE_AUTHORITY` + confidence math (`response-synthesizer.ts:39-63`, `:30-35`).
- **State that stays out:** the role-authority table becomes config (chimera-specific policy).
- **Disposition:** deprecate then delete. Keep `ResponseSynthesizer` as a private helper inside `DeliberationEngineImpl.runDeterministic` so the deterministic path stays LLM-free.

### 4.3 `ResultAggregator` → `DeliberationEngine.run(preset: 'merge')`
- **State that moves in:** the `MERGE_PROMPT` (`result-aggregator.ts:4-29`) and the JSON parse with try/catch.
- **State that stays out:** the concatenation fallback at `result-aggregator.ts:81-90` becomes a degraded-path branch in the engine.
- **Disposition:** wrap-then-delete. Same shim pattern as `FusionExecutor`.

### 4.4 `CoordinatorEngine` — consumes the engine
- **State that moves in:** nothing — `CoordinatorEngine` is the consumer.
- **State that stays out:** the decomposition logic (`TaskDecomposer`, `SubAgentSpawner`) stays. The aggregate call at `coordinator-engine.ts:75` becomes `await this.engine.run({ preset: 'merge', ... })`. The single-subtask path at `:64` is `preset: 'solo'`.

### 4.5 `AgentMesh.executeQualityGate` → `DeliberationEngine.run(preset: 'duo' | 'trio')`
- **State that moves in:** the draft → verify → challenge → synthesize shape.
- **State that stays out:** the `draft_proposed` / `verified` / `challenged` events stay in `AgentMesh` (they're mesh-lifecycle events, not deliberation events).
- **Disposition:** replace the stub at `agent-mesh.ts:71-83` with a delegation. The current stub does no work — replacing it is a strict improvement.

---

## 5. `DeliberationEngineImpl` — pseudocode

```ts
// chimera/packages/chimera-core/src/deliberation/engine.ts (NEW)

class DeliberationEngineImpl implements DeliberationEngine {
  constructor(
    private eventStream: EventStream,
    private costTracker: CostTracker,
    private deterministic: ResponseSynthesizer, // wraps the Jaccard math
  ) {}

  async run(req: DeliberationRequest): Promise<DeliberationResult> {
    if (!this.enforceRecursionGuard(req)) {
      this.eventStream.append({ type: 'fusion_recurision_blocked', depth: ..., maxDepth: ... });
      return this.degrade(req, 'recursion_blocked');
    }

    return req.config.preset === 'fusion' || req.config.preset === 'trio' && req.config.panel.length > 2
      ? this.runFusion(req)
      : req.config.preset === 'merge'
        ? this.runMerge(req)
        : req.config.preset === 'duo' || req.config.preset === 'trio'
          ? this.runDeterministic(req)
          : this.runSolo(req);
  }

  // Solo: just ask one model, return its output.
  private async runSolo(req): Promise<DeliberationResult> { ... }

  // Deterministic: delegate to ResponseSynthesizer for non-LLM consensus.
  private async runDeterministic(req): Promise<DeliberationResult> {
    return this.deterministic.synthesize(/* mapped SynthesisInput[] */);
  }

  // Fusion: parallel panel + LLM judge with 5-field analysis. The OpenRouter shape.
  private async runFusion(req): Promise<DeliberationResult> {
    const providers = req.config.panel.map(m => req.config.providerFactory(m.modelId));
    const settled = await Promise.allSettled(
      providers.map(p => this.timed(p, req, /* add recursion-depth header */)),
    );
    const responses = settled.map(/* → FusionPanelResult */);
    const judgeId = this.pickJudge(req.config);
    const judge = req.config.providerFactory(judgeId);
    const analysis = await this.callJudge(judge, responses, req);
    return this.shape(analysis, responses, req, settled);
  }

  // Merge: same shape as ResultAggregator, with degraded fallback.
  private async runMerge(req): Promise<DeliberationResult> { ... }

  // Cost guard: called before every inner LLM call. Throws BudgetExceededError.
  private enforceCostGuard(req): void { ... }

  // Recursion guard: refuses to run if a parent fusion is already in progress.
  private enforceRecursionGuard(req): boolean { ... }

  // Judge failover: tries judgeModel, then judgeFailover[0..N], then first panel member.
  private pickJudge(config): string { ... }
}
```

The fusion path replaces the unguarded `JSON.parse` at `fusion-executor.ts:72` with a try/catch that returns a degraded result with `analysis.confidence: 0` and `degradationReason: 'judge_parse_error'`.

---

## 6. Risk surface

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Loss of non-LLM consensus semantics — `ResponseSynthesizer`'s Jaccard math is fast and free; moving to LLM-only synthesis costs tokens and adds latency. | High | Keep `ResponseSynthesizer` as the engine's deterministic preset (`duo`/`trio`). Make `fusion` opt-in via complexity routing. |
| 2 | `ROLE_AUTHORITY` (`response-synthesizer.ts:30-35`) encodes a domain assumption (synthesizer > reviewer > challenger > writer) that is chimera-specific. Moving it to config is right but invites drift. | Medium | Hard-code the default authority table; allow override via `DeliberationConfig.roleAuthority`. |
| 3 | Cost is not currently tracked across the 5 systems. Adding tracking is a behaviour change (existing tests assume zero cost). | Medium | Phase the rollout. Track + log for one release behind a `costTrackingEnabled` flag. |
| 4 | Event-stream contract drift. The new fusion path emits `fusion_provider_error` etc. that don't exist in `types/events.ts:3-144`. | High (this is a current bug) | Add the event types in the same PR that introduces the engine. Already in flight as a P0 task. |
| 5 | `OrchestrationPattern` vs `DeliberationPreset` mapping gap — `OrchestrationPattern` is a public type, `DeliberationPreset` is engine-internal. | Low | Document the mapping. The public type stays; the engine preset is a strict superset (`merge` is engine-only, `solo` already exists). |

---

## 7. Open questions

1. **Provider resolution.** Should `providerFactory` come from `ModelRegistry` (`chimera/packages/chimera-providers/src/model-registry.ts:1`) directly, or should the engine accept a `ModelRegistry` and build its own factory? The first is simpler; the second is more testable. (Test currently expects `new FusionExecutor({ eventStream, registry })` — the second.)
2. **Budget enforcement at panel or at request scope?** Per-call tracking is the only way to abort mid-flight; per-request tracking is easier to implement. Recommendation: per-call, with a request-level cap.
3. **Where does `CoordinatorEngine.decompose` live post-migration?** It can stay where it is (it consumes the engine at the merge step) or move into the engine. Recommendation: keep separate; decomposition is not a deliberation concern.
4. **Should the engine emit `cost_alert` or a new `deliberation_budget_exceeded` event?** The existing `cost_alert` is generic enough. Recommendation: reuse it, add the fusion-specific `fusion_budget_exceeded` (already specced in the P0 task).
5. **Streaming.** None of the 5 systems streams partial deliberation output. Should the engine? OpenRouter doesn't. Recommendation: out of scope for v1.
6. **Where does the engine live in the package graph?** `chimera-core` is fine, but it pulls in `chimera-providers` for the factory. Check the dep graph before landing.

---

## 8. Recommended next steps

| # | Step | Owner | Effort | Depends on |
|---|---|---|---|---|
| 1 | Land the P0 event types + `JSON.parse` guard + `FusionConfig` types | subagent (in flight) | S | — |
| 2 | Rewrite `FusionExecutor` to match the test signature | this doc's author | M | 1 |
| 3 | Add `DeliberationEngine` interface + `DeliberationEngineImpl` skeleton | new subagent | M | 1, 2 |
| 4 | Migrate `ResultAggregator` to engine (preset `'merge'`) | new subagent | S | 3 |
| 5 | Migrate `AgentMesh.executeQualityGate` to engine (preset `'duo'/'trio'`) | new subagent | S | 3 |
| 6 | Wire `CoordinatorEngine` to engine at `:32, :75` | new subagent | S | 3, 4 |
| 7 | Delete `FusionExecutor` and `ResultAggregator` shims | this doc's author | XS | 4, 5, 6 |
| 8 | Add `costGuard` to engine + thread `CostTracker` through | new subagent | S | 3 |
| 9 | Add `complexityRouting` rule in `TaskRouter.classifyTask` (overall > 0.75 → `'fusion'`) | new subagent | S | 3 |

---

## Appendix A — claim index

| Claim | Source |
|---|---|
| `FusionExecutor` is at `fusion-executor.ts:11` | `chimera/packages/chimera-core/src/coordinator/fusion-executor.ts:11` |
| `JSON.parse` is unguarded at `fusion-executor.ts:72` | `chimera/packages/chimera-core/src/coordinator/fusion-executor.ts:72` |
| `ResponseSynthesizer` lives at `response-synthesizer.ts:65` | `chimera/packages/chimera-core/src/response-synthesizer.ts:65` |
| Jaccard + `hasOppositeSentiment` at `response-synthesizer.ts:39-63` | `chimera/packages/chimera-core/src/response-synthesizer.ts:39-63` |
| `ROLE_AUTHORITY` table at `response-synthesizer.ts:30-35` | `chimera/packages/chimera-core/src/response-synthesizer.ts:30-35` |
| `ResultAggregator` at `result-aggregator.ts:31` | `chimera/packages/chimera-core/src/coordinator/result-aggregator.ts:31` |
| `MERGE_PROMPT` at `result-aggregator.ts:4-29` | `chimera/packages/chimera-core/src/coordinator/result-aggregator.ts:4-29` |
| Concatenation fallback at `result-aggregator.ts:81-90` | `chimera/packages/chimera-core/src/coordinator/result-aggregator.ts:81-90` |
| `CoordinatorEngine` at `coordinator-engine.ts:18` | `chimera/packages/chimera-core/src/coordinator/coordinator-engine.ts:18` |
| Engine call sites at `coordinator-engine.ts:32, :75` (after migration) | `chimera/packages/chimera-core/src/coordinator/coordinator-engine.ts:32,75` |
| `AgentMesh.executeQualityGate` at `agent-mesh.ts:50` (the agent originally cited `:39`; the JSDoc is at `:46-49` and the method at `:50`) | `chimera/packages/chimera-core/src/agent-mesh.ts:50` |
| Quality-gate stub at `agent-mesh.ts:71-83` | `chimera/packages/chimera-core/src/agent-mesh.ts:71-83` |
| `OrchestrationPattern` type at `types/agent.ts:5` | `chimera/packages/chimera-core/src/types/agent.ts:5` |
| Event Zod schema at `types/events.ts:3-144` | `chimera/packages/chimera-core/src/types/events.ts:3-144` |
| `CostTracker` at `cost-tracker.ts:7` | `chimera/packages/chimera-core/src/cost-tracker.ts:7` |
| `ModelRegistry` at `model-registry.ts:1` | `chimera/packages/chimera-providers/src/model-registry.ts:1` |
| Fusion test signature mismatch at `fusion-executor.test.ts:11` | `chimera/packages/chimera-core/src/coordinator/__tests__/fusion-executor.test.ts:11` |

---

*Note: a previous draft of this report cited `agent-mesh.ts:39` for `executeQualityGate`. The line-39 location is the JSDoc above the previous method. The actual method declaration is at `agent-mesh.ts:50` and the stub body at `:71-83`. The original fusion comparison report is correct in spirit but should be updated.*
