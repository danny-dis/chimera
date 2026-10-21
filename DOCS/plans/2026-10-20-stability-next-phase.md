# Stability next-phase implementation plan

> **For Hermes:** Use the subagent-driven-development skill for bounded independent review; keep memory-heavy builds, graph work and native checks serialized. This document is a plan, not authorization to start it.

**Goal:** Close the observed unattended-completion failures without weakening caller-owned verification, permissions or deadlines.

**Architecture:** Repair the existing shared dispatch and review paths, not another execution framework. Reuse the public CLI acceptance driver, registered tools and checkpoint store; preserve failures alongside successful repeats.

**Tech Stack:** Existing TypeScript/pnpm workspace, Vitest, Node.js and Windows ownership host; no new dependencies.

## Evidence baseline and boundaries

- Branch: `feat/chimera-next-generation-coding-agent`; completed checkpoint descends from `ea996f3`.
- Full saved matrix: run `00a47797-0577-4d75-9f06-87f599bad7b2`, complete=true, 29 rows, 18 passes / 11 needs_user, no broken-and-done artifact, all protected verifiers unchanged.
- Source report: `C:/Users/pc/AppData/Local/hermes/profiles/chimera/cache/scratch/chimera-resume-matrix-001/release-results.json`. Each row names its exact adjacent log.
- Failed rows: code/{hive,swarm}; debug/{auto,trio,swarm}; auto/{auto,solo,duo,trio,hive,swarm}.
- Historical pre-matrix gates: 175 tests / 24 files passed, lint 0 errors / 22 warnings. Four controlled restart cases passed quietly after an earlier unchanged-5000ms verifier timeout. Neither result erases the other.
- Historical live runs include Windows WIP; do not relabel them certification of the committed subset. The controlled 80-read loop is not multi-day endurance or live-provider certification.
- Hive budget regression exists only as preserved WIP. Its startup failed; no regression verdict or production fix landed. Preserve shell WIP, AGENTS/CLAUDE changes, research and local evidence.
- Keep automation paused. No push, merge, release, service reconfiguration or unrelated process termination. Commit each subsequently authorized, verified repair separately.

## Run convention

From repository root in Git Bash, select the verified Node executable and profile scratch explicitly:

```sh
NODE='C:/Program Files/nodejs/node.exe'
export TMPDIR='C:/Users/pc/AppData/Local/hermes/profiles/chimera/cache/scratch'
export TMP="$TMPDIR" TEMP="$TMPDIR"
"$NODE" --version
"$NODE" -p 'require("node:os").tmpdir()'
```

Use a unique `CHIMERA_ACCEPTANCE_DIR` for each live slice. Launch long checks in the background with exit notification. Do not overlap compiler, graph indexing and native startup tests. Measure current memory first; if startup cannot run, record BLOCKED, not a code regression or passing test. Do not kill unrelated processes to manufacture headroom.

Before changing any symbol, run upstream GitNexus impact, inspect source callers and report HIGH/CRITICAL reach. Refresh a stale index only with sufficient headroom. Run staged detect_changes and review the exact staged diff before each commit.

## Task 0 — Clear the three precommit integration blockers

**Preserved files:** `packages/chimera-core/src/session-orchestrator.ts`, `provider-adapter.ts`, `packages/chimera-cli/src/cli-router.ts`, their uncommitted integration regressions and `scripts/check-{long-run,restart-resume}.cjs`. Do not discard their completed neighboring changes. Review findings are in profile scratch `chimera-commit-20261020/review-runtime.json`.

1. **Role identity:** Reproduce with separate writer and challenger instances reporting the same model ID and a distinct reviewer. Assert solo's writer and Trio's writer/challenger reach the intended instances. Current `buildProviderFactory` keys only by model ID, overwriting earlier roles. Keep routing handles distinct from metadata; do not just choose a different collision winner. Extend `src/__tests__/provider-identity-stability.test.ts` through the guarded execution path.
2. **Hard goal deadline:** Extend CLI `goal-execution-limits.test.ts` with a provider returning a never-settling promise and ignoring its signal. Require a small explicit timeout to settle and dispose the owned runtime; caller abort must still work. Restore a configurable timeout race at the existing bounded-provider seam or honor its composed per-call signal. Do not rely solely on transport cooperation.
3. **Delegated repair context:** Extend `repair-task-identity.test.ts` to execute a genuinely delegated failed-verifier repair, without mocking executeRun. Require original task identity plus failed command, diagnostic and repair instruction at the actual worker. Pass separate context through runDelegated/coordinator rather than changing the task identity again.
4. Also cover resume with more than 20 tool observations: preserve a deliberate allowance for user/assistant context instead of letting appended observations evict every turn. This is a review suggestion, not a reproduced failure yet.
5. Obtain upstream impact before each edit; demonstrate RED/GREEN and independent revision review. Then build and run the scoped core/CLI checks, controlled restart and 80-read driver against that exact candidate. Commit only the repaired integration slice; the current smaller checkpoint does not contain these fixes or certify these drivers.

## Task 1 — Reproduce the unfinished Hive budget boundary

**Files:** `packages/chimera-core/src/coordinator/deliberation/__tests__/hive-tool-budget.test.ts` (existing WIP); inspect `deliberation/engine.ts:447-539`, `coordinator-engine.ts`, `sub-agent-spawner.ts:21,256`.

1. Verify the WIP test's bytes are preserved and no other process is editing this slice.
2. Run only the existing regression, retaining complete output and actual exit status:

```sh
"$NODE" node_modules/vitest/vitest.mjs run packages/chimera-core/src/coordinator/deliberation/__tests__/hive-tool-budget.test.ts --maxWorkers=1 --minWorkers=1 --exclude '**/.claude/**'
```

3. Require an actual assertion failure: with limits 1 and 6, workers must execute exactly limit+1 completions/batches, including the final drain. A worker-launch failure is not RED evidence.
4. Trace `cfg.maxToolRounds` through runHive -> coordinator toolDeps -> SubAgentSpawner -> shared loop. The current engine omits it while the spawner already accepts `maxIterations` and defaults to 12.

**Exit:** A reproducible budget mismatch with positive tool execution; otherwise document the exact startup blocker and stop implementation.

## Task 2 — Forward the Hive budget at the existing seam

**Modify:** `packages/chimera-core/src/coordinator/deliberation/engine.ts`, only runHive's existing coordinator `toolDeps` construction unless Task 1 disproves the seam.

1. After impact analysis, forward a defined `cfg.maxToolRounds` as the existing `maxIterations` field. Preserve omitted-value behavior; no new config, scheduler or global default increase.
2. Rerun Task 1 GREEN, then dependency-results, Hive tool contract, cancellation, permission and coordinator scheduling tests. Inspect actual discovered test paths, not only totals.
3. Build core before CLI and consumer checks; execute a fresh `COMBO=code/hive` release slice, then `COMBO=auto/hive`. Record artifacts, worker budget, final verification, child exit and handler degradation separately.
4. Commit the regression with the minimal production fix only after checks pass. Budget forwarding alone must not be claimed to solve the observed abort or merge failures.

## Task 3 — Correct Auto coding without guessing at model failure

**Inspect first:** `packages/chimera-core/src/session-orchestrator.ts` (classification, repairContext and resolved preset), `task-router.ts`, `coordinator/solo-executor.ts`, `duo-executor.ts`, `agent-tool-loop.ts`, `packages/chimera-cli/src/cli-router.ts`, `scripts/live-repo-feature.cjs`.

1. Read logs for auto/auto, auto/solo and auto/duo from the baseline report. Observed diagnostics respectively include null !== 5, missing `calc` export and invalid JavaScript; capture original reads, exact failed tool results and repair requests.
2. Compare the same existing two-file task under code/solo and auto/solo with identical configured providers. Observe requested/resolved/executed mode and preset, writer contract, context and permissions on initial/follow-up/repair calls.
3. Add one captured-request or executable-artifact regression for the demonstrated lost contract/context, if any. Assert requests outside provider.complete so retry handling cannot swallow assertions. Do not add prompt text or increase rounds without a reproduced omission.
4. Fix the shared root cause, preserve add/mul/unknown-operation behavior, rerun the negative verifier case and repeat the exact live slice twice with independent artifact execution.

**Exit:** Nontrivial Auto coding completes with correct exports/behavior, unchanged verifier, intended-only mutation and non-degraded executed-handler proof. Model availability, artifact correctness and unattended completion remain separate results.

## Task 4 — Resolve Hive/Trio completion, not just landed files

**Inspect:** `coordinator/trio-executor.ts`, `review-verdict.ts`, `result-aggregator.ts`, `deliberation/engine.ts`, `session-orchestrator.ts` completion and verification boundaries.

1. Start with code/hive, debug/trio, debug/swarm and auto/trio logs. The baseline artifacts passed independently, but completion did not. Code/hive's verifier reason was Aborted; do not infer its cause from that string alone.
2. Capture the actual draft, compact tool-success/exit summary, strict reviewer response and stage timing. Determine whether rejection concerns missing prose, absent observed changes, genuine implementation defects, deadline exhaustion or merge conflict.
3. Reproduce the specific path with a small controlled regression through the public orchestrator plus registered verifier. Preserve valid FAIL/NEEDS_REVISION, malformed/mixed JSON rejection and cancellation at every stage.
4. Apply the smallest verified repair and repeat affected live rows, including swarm -> trio remaps. Never change `needs_user` to done solely because a file exists or a reviewer said PASS.

**Exit:** Correct artifact AND accepted completion under the original verifier/deadline. Unrelated failures stay open, not suppressed.

## Task 5 — Finish Windows startup and quoting independently

**Preserved WIP:** `packages/chimera-tools/src/tools/shell.ts`, `sandbox/captured-process.ts`, `src/__tests__/shell-orphan-ownership.real.test.ts`, `shell-quoting.real.test.ts`, `scripts/check-shell-{failures,lightweight,native}.cjs`, `scripts/check-windows-owner.cjs`.

1. Read each current WIP diff and existing retained startup-phase evidence before editing. Separate literal quoting defects from slow valid startup; cold LSP loading changes are not proof of native reliability.
2. Run positive direct Node, ownership-host and shell ready-marker controls on a quiet host, then the unchanged real ownership/quoting tests. Preserve busy/quiet results separately.
3. Require exact owned-process birth/ancestry, positive ready markers, descendant reaping, cancellation/deadline and output-limit results. No global process-name kills, relaxed deadlines or negative-only assertions.
4. Reproduce and fix one native root cause per patch; rerun the complete affected native file, not only one passing case. Commit Windows work only once that exact candidate passes.

## Task 6 — Re-certify, then propose the unattended soak

1. Rebuild context -> LSP -> core -> tools -> CLI in dependency order; typecheck daemon/TUI. Run owning regressions, lint/security, offline acceptance, cold-entry, controlled restart and long-loop checks against the frozen source snapshot. Resolve the known malformed legacy Trio smoke fixture explicitly; never silently count that suite green or weaken the parser.
2. Run the matching 29-row driver with `--release` in a unique directory. Require complete=true, exact combo coverage, clean child exits, no timeout, independently correct artifacts/content, immutable verifiers, intended-only mutations and requested/resolved/executed evidence. Repeat previously failing rows; retain earlier failures.
3. If all short gates pass, propose a separately authorized **72-hour soak** over representative existing-repository code/debug/review tasks, provider transients, explicit restart and cancellation. Record every task, progress/stall, retries, memory/process growth, cost and verifier result. Do not invent benchmark thresholds from a tiny fixture.
4. Unattended release requires no manual rescue, no false done, no verifier mutation, no leaked owned processes and completed task acceptance throughout the soak. A stalled/provider-unavailable interval is a recorded failure or blocked gate, not an omitted sample.
5. Publish a new source-bound readiness verdict. Release/push/merge and automation resume remain separate user decisions.

**Deliberately skipped:** New execution abstractions, new providers/dependencies, expanded Hive tool authority, blanket budget increases and a replacement acceptance harness. Add only if a concrete failing case proves the existing path insufficient.
