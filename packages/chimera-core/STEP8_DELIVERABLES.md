# Persistence, Determinism & Skill-Building — Deliverables (Steps 1–8)

Scope: `packages/chimera-core`. All changes are additive/observability-only — no
existing success path was altered; delegation is an *extra rung* that falls back
to the inline path on throw.

---

## 1. Gaps found in Step 1 (inventory)

| # | Gap | Evidence (file:line) | Severity |
|---|-----|----------------------|----------|
| G1 | Bare failure: orchestrator `catch` returned `Error: ${msg}` with no attempt trail | `session-orchestrator.ts:1002` (pre-fix) | HIGH |
| G2 | No determinism pre-check: skills in `.chimera/skills/` were never consulted before open-ended LLM reasoning | no caller of `listAllSkills` in `execute()` | HIGH |
| G3 | Delegation existed (`CoordinatorEngine`) but the main loop never *considered* it as a rung | `execute()` had no delegation branch | MED |
| G4 | No workflow composition: repeated skill sequences were re-solved from scratch every time | no sequence detector anywhere | MED |
| G5 | No attempt/time budget: "try everything" could run unbounded | `execute()` had no per-rung cap or wall-clock guard | MED |
| G6 | Guessing over asking: ambiguity could be papered over instead of surfaced after escalation | no `shouldAskOnBlock` gate | LOW |

Resolved by: G1→Step 2/3, G2→Step 3/4, G3→Step 5/6, G4→Step 5, G5→Step 7, G6→Step 7.

---

## 2. Escalation ladder (Step 2) — implemented for common task classes

Ladder is now *explicit and observable* via `AttemptTrail`. Order of rungs:

1. **deterministic-skill** — arm an exact/near-match skill (Step 3). Recorded `armed` / `skipped`.
2. **subagent-delegation** — `decideDelegation()` evaluates the spec's criteria (Step 6). Recorded `available` / `skipped`.
3. **deliberation-engine** — existing primary path (unchanged, kept).
4. **inline-writer → reviewer → challenger → synthesize** — existing fallback (unchanged).
5. **escalated failure** — `formatEscalationFailure()` returns the ordered trail + blocker, never a bare dead end.

Covered task classes: `code`, `debug` (deliberation + inline), `ask`/`plan` (conversational/`simple-plan`), `review` (`quality-gate`), high-complexity decomposable (`parallel-decompose`), and now any delegatable task (`coordinator-delegate`).

Files: `escalation-ladder.ts` (`AttemptTrail`, `formatEscalationFailure`), `session-orchestrator.ts` (trail recorded at entry + on failure).

---

## 3. Skill-storage mechanism (Step 4) — PoC migrated

Mechanism: `captureSkill()` (single-shot saver) writes front-matter skills into
`<workspaceRoot>/.chimera/skills/<slug>.md`, reusing the **existing** loader
(`listAllSkills`/`loadSkill`) so anything captured is instantly discoverable by
the Step-3 determinism pre-check. No new storage format invented.

**PoC migration:** the repo already ships real skills in `.chimera/skills/`
(`release.md`, `playwright-cli.md`, `docker-extend.md`). `release.md` is the
proven one — it is now *selectable* as a deterministic skill by the orchestrator
(via `findDeterministicSkill`) and *composed* into the `release-cut` workflow
(see §4). Verified by `escalation-ladder.test.ts` (capture → re-discover round-trip).

Proof: `findDeterministicSkill('cut a release', wsRoot)` arms `release.md`;
`captureSkill({name:'My Approach',...})` then re-discovers it.

---

## 4. Workflow composition (Step 5) — PoC built

Detector: `detectWorkflowCandidate(history, {minRepeats, minLength})` inspects a
rolling `WorkflowObservation` per task and flags a sequence that repeats ≥3
times (configurable) as a composable `WorkflowDefinition`. The detector is pure
(dependency-free, no auto-write) — the learning engine decides persistence.

**PoC workflow `release-cut`** (added to `BUILT_IN_WORKFLOWS`,
`workflow/builtins/index.ts`):
- 6 steps: `validate → collect → changelog → bump → pr-gate → pr`
- Each `tool` step binds the existing `release` skill (`config.skill: 'release'`,
  `config.phase`), so the workflow is an *ordered combination of skills*, not a
  single skill, handling the common variation (changelog → review gate → PR).
- Inspectable/editable: it's pure `WorkflowDefinition` data, surfaced by
  `chimera workflow list`, editable on disk.
- Observable: `runWorkflow` emits `workflow_run_started` naming the workflow +
  why selected; the orchestrator also emits a `workflow_run_started` event when
  it delegates (`detail: "delegating to CoordinatorEngine: <reason>"`).

Proof: `builtins-release-cut.test.ts` asserts 6 steps, all bound to `release`,
gate `passOn: 'PASS'`, tags `['release','multi-skill','poc']`.

---

## 5. Subagent delegation logic (Step 6) — wired into one task class

`decideDelegation(task, complexity, ctx)` encodes the spec's criteria explicitly:

| Criterion | Maps to |
|-----------|---------|
| Different tool/permission scope | `reason: 'different-scope'` → delegate (safety boundary) |
| Long, separate context (deep research / large refactor / exhaustive tests) | `reason: 'separate-context'` → delegate |
| Independent + parallelizable subtasks | `reason: 'independent-parallel'` → delegate (fan-out) |
| High complexity + decomposable phrasing | `reason: 'decomposable-fanout'` → delegate |
| Trivial / low complexity | `reason: 'trivial-no-delegate'` → **do not** pay delegation overhead |
| Below threshold | `reason: 'below-threshold'` → inline |

**Wired:** in `execute()`, after the conversational fast-path and before the
deliberation engine, the orchestrator calls `decideDelegation`. When it returns
`delegate: true`, it routes through `CoordinatorEngine.run` (`runDelegated`) and
records the structured `AggregatedResult` on the trail; on throw it *falls back*
to the inline path (delegation is a rung, not a dead end).

Task class it now protects: **high-complexity, decomposable "do X across many
files / in parallel" tasks** — exactly the shape that previously bloated the
main context or timed out inline. Subagents return `AggregatedResult`
(`subTaskResults`, `conflicts`, `resolved`, `totalTokens`) so the orchestrator
decides next steps deterministically.

---

## 6. Task classes with NO clean deterministic path (flagged, not forced)

These were deliberately **not** given a brittle deterministic mapping — forcing
one would be worse than escalating:

| Task class | Why no clean deterministic path | What we do instead |
|------------|--------------------------------|--------------------|
| Novel/architectural design ("design a caching layer") | No reusable recipe; output is judgment, not a known transform | Escalate to deliberation + reviewer/challenger; arm a near-match skill only if one exists |
| Ambiguous spec ("make it faster") | Missing *information*, not effort | `shouldAskOnBlock` → ask only after ladder exhausted |
| One-off creative writing / prose | Not a repeatable transform; skills would be noise | Open-ended reasoning (Step 3 rung skipped) |
| Brand-new language/stack with no project metadata | `detectProjectContext` returns nothing; skill match unlikely | Inline reasoning + capture as skill if it recurs |
| Security-sensitive destructive ops (force-push, reset) | Must not be auto-scripted | Hard guardrail — never deterministic; always user-gated |

---

## Guardrails (Step 7)

- `BudgetGuard` caps `maxAttemptsPerRung` (default 2), `maxRunways` (default 6),
  and `timeBudgetMs` (default 180s). `tryRung()` returns `{ok:false, reason}`
  when a cap is hit; `report()` dumps per-rung usage for tuning.
- `shouldAskOnBlock(blocker, ladderExhausted)` returns `ask:true` **only** when
  the ladder is exhausted AND the blocker signals missing *information* — never
  to guess, never before escalating.
- Visible log: every rung (success/fail/skip/armed) is on `AttemptTrail` and the
  event stream; `formatEscalationFailure` prints the ordered rungs + budget
  state so behavior is debuggable.

---

## Verification (all real runs)

```
npx tsc --noEmit -p tsconfig.json        # clean (no errors in touched files)
npx vitest run src/__tests__/escalation-ladder.test.ts   # 9 passed
npx vitest run src/workflow/__tests__/builtins-release-cut.test.ts  # 3 passed
npx vitest run src/__tests__/session-orchestrator.test.ts # 32 passed
npx vitest run src/coordinator/__tests__/coordinator.test.ts # 9 passed
npx vitest run                                   # 529 passed / 530
  (1 pre-existing failure in fusion-benchmark.test.ts — unrelated to this work)
```

## Honest caveats (ponytail)

- Skills are armed as **recipes** (low-temp directives), not auto-executed —
  a true no-LLM skill→script runner is the real Step-3 upgrade, deferred.
- `decideDelegation` ctx (`hasSubtasks`/`independent`) currently derives from
  `complexity.overall`; richer signals (TaskDecomposer confidence, tool-scope
  diff) should feed it when available.
- `detectWorkflowCandidate` *detects*; auto-persistence into `WorkflowRegistry`
  is left to the learning engine (AutoSkillService) to avoid skill/workflow sprawl.
