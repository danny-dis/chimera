# Plan: Apply fusion learnings to trio, duo, and solo modes

> Derived from `research/deliberation-engine-design.md`, `research/fusion-router-comparison.md`, and the fusion benchmark work (2026-06-15). Goal: bring the three other orchestration modes up to the same rigor as the just-completed fusion mode.

## 1. Learnings from fusion work that apply

The fusion rewrite and benchmark surfaced 9 patterns that any deliberation system needs. Each one is missing or weak in trio/duo/solo:

| # | Learning | Source | Solo | Duo | Trio |
|---|---|---|---|---|---|
| 1 | **Defensive event emission** — `safeEmit` catches ZodError when event types aren't in the schema. | `fusion-executor.ts:430-440` | ✗ | ✗ | ✗ |
| 2 | **Factory pattern for provider resolution** — `(modelId) => LLMProvider`, not pre-constructed providers. | `fusion-types.ts:50` | ✗ | ✗ | ✗ |
| 3 | **Config-driven knobs** — `temperature`, `maxCompletionTokens`, `maxDepth`, `budgetUsd`, `judgeFailover` are all in `FusionConfig`. | `fusion-types.ts:8-45` | ✗ | ✗ partial (no temp/maxTokens/budget) | ✗ |
| 4 | **Cost tracking via `CostTracker.recordSpend`** per inner call, with USD computed from registry pricing. | `fusion-executor.ts:198-202, 387-401` | ✗ | ✗ | ✗ |
| 5 | **Recursion guard via `FusionContext.depth` + `maxDepth`**. | `fusion-executor.ts:97-108, fusion-types.ts:48` | ✗ | ✗ | ✗ |
| 6 | **Degraded fallback** — never throws on bad input, returns `degraded: true` with a reason. | `fusion-executor.ts:170-194, 215-235` | ✗ | partial (`ResultAggregator` has concat fallback) | ✗ |
| 7 | **5-field structured analysis** — `consensus, conflicts, uniqueInsights, blindSpots, finalResponse` (+ `thought, confidence`). | `fusion-types.ts:79-90` | n/a | ✗ (uses `Conflict` type instead) | ✗ |
| 8 | **Defensive `usage` access** — `result.usage?.inputTokens ?? 0`. | `fusion-executor.ts:262, 292, 296` | ✗ (direct access in `CoordinatorEngine`) | ✗ | ✗ |
| 9 | **Test coverage with a benchmark** — 6-metric virtual benchmark prints a parity table. | `coordinator/__tests__/fusion-benchmark.test.ts` | ✗ | ✗ | ✗ |

The other major learning is **the 5-overlapping-systems problem** — `FusionExecutor`, `ResponseSynthesizer`, `ResultAggregator`, `CoordinatorEngine`, and `AgentMesh.executeQualityGate` all do "ask N, synthesize 1." The fusion benchmark proved one engine can be made rigorous; the other four still need the same treatment.

## 2. Current state per mode

### Solo
- **No dedicated class.** Solo is the default path in `SessionOrchestrator` and `CoordinatorEngine.execute()` when there's nothing to coordinate. The actual "ask one model, return result" is a single `provider.complete(task)` call.
- No `SoloConfig`, no knobs, no degraded fallback, no cost tracking.
- Tested only by smoke through `SessionOrchestrator`.

### Duo
- **Implemented by `ResponseSynthesizer`** (`response-synthesizer.ts:65`).
- Deterministic synthesis via Jaccard + `hasOppositeSentiment` + `ROLE_AUTHORITY` table. Fast, free, no LLM call for the synthesis step.
- Takes pre-built `SynthesisInput[]` — caller has already gathered the responses. No factory pattern, no model IDs.
- Output is `SynthesisResult` with `unifiedResponse`, `conflicts[]` (4 fields), `mergedIssues[]`, `overallConfidence`, `needsUserEscalation`. Different shape from fusion's 5-field analysis.
- Zero test coverage.

### Trio
- **Implemented by `AgentMesh.executeQualityGate`** (`agent-mesh.ts:50`).
- **It's a stub.** Returns `{ verdict: 'pass', output: '' }` without calling any LLM. The whole quality gate pattern (draft → verify → challenge → synthesize) is named in the docstring but not implemented.
- Takes `draftAgentId, reviewerAgentId, challengerAgentId` as agent IDs. No factory pattern, no knobs.
- No cost tracking, no worktree isolation (despite having `WorktreeIsolation` available), no degraded fallback.
- Zero test coverage.

## 3. Proposed improvements

### 3.1 Solo — make it a first-class preset

Create `coordinator/solo-executor.ts` (or expose as `DeliberationEngine.run(preset: 'solo')`):

```ts
interface SoloConfig {
  model: string;
  temperature?: number;
  maxCompletionTokens?: number;
  reasoning?: { effort?: 'low' | 'medium' | 'high'; maxTokens?: number };
  budgetUsd?: number;
}

class SoloExecutor {
  execute(task: string, config: SoloConfig, providerFactory: FusionProviderFactory): Promise<string>;
  executeWithAnalysis(task, config, factory, context?): Promise<SoloResult>;
}
```

- Add `SoloResult` (output, tokens, cost, duration, degraded, reason).
- `safeEmit` any events.
- `CostTracker.recordSpend` on the call.
- `FusionContext.depth` for nested invocation safety.
- Defensive `usage` access.
- Degraded fallback on network errors (return empty result, `degraded: true`).
- Tests: smoke + a small `solo-benchmark.test.ts` with 2 metrics (quality, cost).

**Effort:** S (small, new file is ~100 lines).

### 3.2 Duo — wrap `ResponseSynthesizer` with the safety nets

Don't replace the deterministic synthesis — it's fast and free, which is the whole point of duo. Just wrap it with the rigor:

- Add a thin `DuoExecutor` that:
  - Resolves two `LLMProvider` instances via factory.
  - Calls each in parallel (`Promise.allSettled`).
  - Builds `SynthesisInput[]` for the surviving responses.
  - Delegates synthesis to `ResponseSynthesizer.synthesize`.
  - Wraps the result in the fusion 5-field shape: `consensus` = what both agreed on, `conflicts` = `synthesizerResult.conflicts`, `uniqueInsights` = derived from issue list, `blindSpots` = gaps detected by `gaps` conflict type, `finalResponse` = `unifiedResponse`.
  - `safeEmit` events.
  - `CostTracker.recordSpend` per call.
  - `degraded` if either provider failed.
  - Preserve `ROLE_AUTHORITY` semantics as a `DuoConfig.roleAuthority` override (default: chimera's table).
- Move `ResponseSynthesizer` to `coordinator/response-synthesizer.ts` and make it `internal` to the package.
- Tests: smoke + a `duo-benchmark.test.ts` with 3 metrics (synthesis quality, deterministic path correctness, cost).

**Effort:** S–M (small new file, may need to relocate `ResponseSynthesizer`).

### 3.3 Trio — implement the stub properly

Replace `AgentMesh.executeQualityGate` with a real implementation:

- Add a `TrioExecutor` class (or method on `AgentMesh`):
  - Resolve three `LLMProvider` instances via factory.
  - **Stage 1 — Draft**: `draftProvider.complete(task)` → `draftResult`. Run inside a `WorktreeIsolation` worktree (the worktree exists, it's not being used here).
  - **Stage 2 — Review**: `reviewerProvider.complete(review task + draft)` → `reviewResult`. `hasIssues = reviewResult.issues.length > 0`.
  - **Stage 3 — Challenge** (optional): `challengerProvider.complete(challenge task + draft + review)` → `challengeResult`.
  - **Stage 4 — Synthesize**: if `challengerResult` exists, delegate to `ResponseSynthesizer.synthesize` with the 3 inputs. Otherwise use the `ResponseSynthesizer` with 2 inputs (writer + reviewer).
  - `safeEmit` the existing `draft_proposed`, `verified`, `challenged` events.
  - `CostTracker.recordSpend` per call.
  - `degraded` if any stage fails.
  - Recursion guard via `FusionContext.depth`.
  - Map synthesis result to the 5-field analysis shape.
- Delete the stub at `agent-mesh.ts:71-83`.
- Tests: smoke + a `trio-benchmark.test.ts` with 4 metrics (full gate runs, isolation works, cost tracking, role-based synthesis).

**Effort:** M (real implementation, touches existing class).

### 3.4 Unification — `DeliberationEngine` (from the design doc)

This is the bigger architectural work. Already designed in `research/deliberation-engine-design.md`. The key idea: one engine, 5 presets (`solo, duo, trio, fusion, merge`), the existing 5 systems become private helpers or are deleted.

| Existing | Becomes |
|---|---|
| `FusionExecutor` | `DeliberationEngineImpl.runFusion` |
| `ResponseSynthesizer` | `DeliberationEngineImpl.runDeterministic` (private) |
| `ResultAggregator` | `DeliberationEngineImpl.runMerge` (private) |
| `CoordinatorEngine` | consumer of the engine at `:32, :75` |
| `AgentMesh.executeQualityGate` | `DeliberationEngineImpl.runTrio` |

The engine is a single seam. All 5 modes get the same safety nets, cost tracking, config validation, and test coverage from one place.

**Effort:** L (architectural change, requires migration plan execution from the design doc).

### 3.5 Extend the benchmark to cover all 5 modes

The fusion benchmark uses 6 metrics. Extend the same pattern:

| Mode | New metrics | Effort |
|---|---|---|
| Solo | Quality, Cost, Defensive (handles bad usage) | S |
| Duo | Synthesis quality, Deterministic path, Cost, Escalation correctness | S–M |
| Trio | Full gate runs, Isolation, Cost, Role-based synthesis, Challenger integration | M |
| Merge | Aggregation correctness, Fallback on parse fail, Cost | S |

Combined benchmark file: `coordinator/__tests__/deliberation-benchmark.test.ts`. Same 0/1 scoring per metric, same parity table output.

**Effort:** M (parallel to the mode work, doesn't block it).

## 4. Phased implementation plan

```
Phase 1 — Quick wins (1–2 hours of work)
  ├─ Solo: add `safeEmit` to any direct `eventStream.append` in CoordinatorEngine
  ├─ Duo: add `safeEmit` to ResponseSynthesizer
  ├─ Trio: add `safeEmit` to the stub (it doesn't even emit yet)
  ├─ All: defensive `result.usage?.x ?? 0` everywhere
  └─ All: cost tracking via CostTracker (use the fusion `computeCost` helper)

Phase 2 — Solo executor (1 hour)
  ├─ Create `coordinator/solo-executor.ts`
  ├─ Add `SoloConfig` to `coordinator/fusion-types.ts` (or a new `deliberation-types.ts`)
  ├─ Wire `safeEmit`, cost, recursion guard
  └─ Smoke test + 1 benchmark metric

Phase 3 — Trio executor (3–4 hours)
  ├─ Implement the 4-stage gate properly
  ├─ Wire `WorktreeIsolation` for the draft
  ├─ Wire cost tracking
  ├─ Map result to 5-field analysis shape
  ├─ Delete the stub
  └─ Smoke test + 4 benchmark metrics

Phase 4 — Duo wrapper (2 hours)
  ├─ Create `coordinator/duo-executor.ts`
  ├─ Wrap `ResponseSynthesizer` with the safety nets
  ├─ Map result to 5-field analysis shape
  ├─ Move `ResponseSynthesizer` to internal location
  └─ Smoke test + 3 benchmark metrics

Phase 5 — Unification (1–2 days)
  ├─ Create `deliberation/types.ts` and `deliberation/engine.ts`
  ├─ Migrate Solo, Duo, Trio, Fusion, Merge into the engine
  ├─ Update CoordinatorEngine to consume the engine
  ├─ Delete the 5 separate systems (or keep as deprecated shims)
  └─ Extend benchmark to cover all 5 modes

Phase 6 — Validation (1 day)
  ├─ Run extended benchmark
  ├─ Confirm 5/5 modes at parity
  └─ Update AGENTS_CHECKLIST.md section 18 with the new parity status
```

The phases are mostly sequential. Phase 1 is independent. Phases 2–4 can run in any order. Phase 5 unifies. Phase 6 validates.

## 5. Effort summary

| Phase | Effort | Output |
|---|---|---|
| 1. Quick wins | S | 3 modes with safety nets, no new classes |
| 2. Solo executor | S | New file, 100 lines, 1 test |
| 3. Trio executor | M | Real impl, 200 lines, 1 test |
| 4. Duo wrapper | S–M | New file, 150 lines, 1 test |
| 5. Unification | L | Architectural cleanup, 1 new package dir |
| 6. Validation | S | Benchmark extended, parity report |

**Total estimate: ~3 days of focused work** for the full plan. Phase 1 alone is <1 hour and gives meaningful safety improvements immediately.

## 6. Risks and open questions

1. **Migration risk** — Phase 5 unification touches 5 existing systems. Each has at least one caller (real or test). Migration must be wrap-then-delete, not big-bang. The design doc's "shim for one minor version, then delete" approach applies.
2. **Deterministic vs LLM synthesis** — Duo and Trio use `ResponseSynthesizer`'s Jaccard math. Replacing it with an LLM judge (like fusion) would change the cost profile (free → paid). Decision needed: keep deterministic or move to LLM-judge for duo/trio? Recommendation: keep deterministic for duo (the point of duo is "no judge cost"), allow LLM-judge opt-in for trio.
3. **Worktree isolation cost** — Wrapping the draft stage in a worktree adds latency (clone, commit, merge). For non-code tasks, this is overhead. Recommendation: opt-in via `TrioConfig.isolateWorktree: boolean`.
4. **The `OrchestrationPattern` vs `DeliberationPreset` mapping** — `OrchestrationPattern` is public (`'duo' | 'trio' | 'fusion' | 'solo'` at `types/agent.ts:5`). `DeliberationPreset` is engine-internal. They should stay aligned. The engine can validate that callers don't pass mismatched values.
5. **Benchmark cost** — Extending the benchmark adds more mock scenarios but no real cost. The existing fusion benchmark is 22ms. A combined benchmark would be ~100ms. Trivial.

## 7. Recommended next step

**Phase 1 + Phase 2** as a single unit of work. They give:
- Defensive event emission everywhere (no more runtime ZodError on trio/duo paths)
- Cost tracking everywhere
- A real solo class

Total: ~2 hours, lands in 2 PRs. Then a decision on whether to do Phase 3 (trio — the biggest payoff since the current impl is a stub) before or after Phase 4 (duo) and Phase 5 (unification).

---

*Plan derived from the fusion benchmark work (2026-06-15) and the unified `DeliberationEngine` design at `research/deliberation-engine-design.md`. All file references use the current state of `chimera/packages/chimera-core/src/`.*
