# Daily-driver hardening: verification and remaining work

This is a partial-delivery checkpoint, not a declaration that Chimera is ready
for unattended daily use. Completed code and unfinished local work are kept
separate. The original implementation baseline is `0624d6b`.

## Harness checkpoint — 2026-10-12

This checkpoint captures the integrated harness, provider, memory, CLI, daemon,
LSP, workflow, and packaging work after `78246a2`. It is a development checkpoint,
not a release or unattended-use certification. Local research logs, worktrees,
temporary worker files, and unfinished native Windows Job Object drafts are
excluded from the commit.

Latest executed checks before preparing this checkpoint:
- Provider suite: **147 passed**, including five real HTTP cancellation checks.
- CLI suite: **82 passed**; provider and CLI project builds exited 0.
- Focused core integrity, output-scope, security/memory, and diagnostic checks:
  **16 passed**.
- Built CLI verbose/offline JSON acceptance passed for ask, plan, and review.
- Real configured-provider debug acceptance exited 0 in 60,458 ms: the target
  changed, independent artifact verification passed, and the verifier was untouched.
- Frozen dependency installation with scripts disabled exited 0; Koffi's Windows
  x64 prebuild loaded and its native PID call matched the owning process.
- Fresh uncached workspace build: **20/20 tasks passed**; build integrity checked
  1,495 artifacts across 20 packages without corruption.
- Staged-file ESLint exited 0 with warnings; scoped independent harness-boundary
  and packaging/CI reviews reported no security or logic blockers.
- Clean packed-consumer smoke passed for all 14 runtime packages: version/help,
  sessions, and built-in workflow discovery ran without provider calls.
- Full core suite: **1,142 passed, 1 failed**. The failing completion-seam assertion
  expects changed secret-config inputs to bypass verification; the strengthened
  integrity check correctly refuses that change. The test contract remains unreconciled.

Remaining blockers: Windows ownership-safe cleanup exceeded the existing
1.5-second bound under full-suite load; native Job Object integration is unfinished;
parallel coding acceptance failed its independent artifact check; final full
workspace tests/static gates and whole-system acceptance remain outstanding.

The records below describe earlier integration and publication snapshots.
They are historical evidence, not fresh approval of this checkpoint.

Delayed reviews were reconciled against current source, not accepted as current
line-by-line findings. Regression failures were reproduced before production fixes:
- Coordinator/goal waits and every synthesis retry now check or race cancellation;
  direct merge forwards its signal, and cancelled aggregation preserves child evidence.
- Real Git dirty detection includes staged, unstaged, and untracked artifacts.
- TUI custom workflows dispatch the real runner; goal uses a shared writer/reviewer
  call ceiling, rejects hung/late completion, and forwards explicit `--yolo` while
  retaining default-deny and read-only mode protections.
- Daemon pending initialization is discoverable and cancellable before awaits;
  completed/rejected spend is retained, exact RPC IDs remain distinct, and shutdown
  cannot resurrect event subscriptions. Async RPC rejection is serialized.
- LSP transport ownership survives failed listen/disposal and late factories;
  retained transports remain deadline-wrapped. Notification promises are awaited
  before document bookkeeping; concurrent opens share synchronization. Failed
  registry ownership is associated with its workspace and blocks replacement.

Observed current-source checks (logs under `research/oct11/`):
- Core: **1,099 passed** (`reconcile-core-full.log`).
- CLI: **67 passed** (`reconcile-final-cli.log`).
- Daemon: **74 passed**, own project compiler exit 0 (`reconcile-daemon-final-green.log`).
- LSP: **91 passed**, own project compiler exit 0 (`reconcile-sync-chokepoint-green.log`).
  Public document updates now reuse the same serialized query synchronization path.
  Final LSP/tools/daemon/CLI consumer rebuild and integrity check exited 0
  (`reconcile-last-build.log`).
- TUI: **142 passed, 3 skipped** (`reconcile-latest-tui.log`).
- Uncached workspace build: **20/20 passed, 0 cached**, integrity check passed
  (`reconcile-latest-build.log`), before the last private LSP/registry refinements.
  The final LSP/tools/daemon/CLI consumer rebuild also passed, exit 0.
- Built CLI real coding acceptance passed repeatedly: exit 0, status `done`,
  independently executed artifact, untouched caller verifier. Last completed
  post-refinement records: `reconcile-shipped-live.log` and `reconcile-last-offline.log`.
  Final live run: exit 0, no timeout, status `done`, artifact verified, verifier
  untouched. This is one small task, not all-mode or unattended-use certification.
- Six built offline checks passed: real shell execution, exact owned-process
  cancellation, permission denial, failed verification, pre-aborted execution,
  and subsequent recovery. These are offline boundary probes, not live repair proof.

Remaining gates are explicit:
- Full tools suite remains RED: **344 passed, 4 failed, 1 skipped** in
  `reconcile-latest-tools.log`. Three legacy tests invoke a Windows `.CMD` server
  directly and fail with `spawn EINVAL`; a real-TypeScript fixture's directory
  cleanup failed with `EBUSY`.
- The real TypeScript/trust/registry subset passed **8 tests** in isolation
  (`reconcile-real-lsp-final.log`), then the latest combined subset had **7 passed,
  1 failed** due to `EBUSY` cleanup (`reconcile-registry-last.log`). The isolated
  pass does not erase the full-run or repeated cleanup failure.
- Goal/aggregation, daemon, and the final LSP revision received scoped independent
  quality approval. These reviews cover their explicitly inspected paths; they
  do not certify whole-system or unattended runtime readiness.
- Turbo warns that `packages/chimera-agent-pc` is absent from the lockfile's workspace
  inventory. Remote CI, sustained concurrency, all mode/preset/provider combinations,
  live failed-check recovery, and restart durability remain uncertified.
- Disk pressure was observed throughout verification. No WIP/worktree cleanup,
  dependency installation, new commit, or push was performed in this reconciliation.

## Historical published checkpoint

## Publication scope

This checkpoint's code is confined to `packages/chimera-tools`:
- `src/tool-executor.ts`: authorize normalized arguments, recheck changed hook
  arguments and overwrite retries, refuse cancelled dispatch and policy errors,
  and keep private argument snapshots isolated from previews and event listeners.
- `src/permission/path-restrictions.ts`: canonical workspace containment,
  escaping symlink ancestors, and fail-closed inaccessible-path checks.
- `src/tools/shell.ts`: explicit child environment, canonical working directory,
  cancellation and timeout cleanup of the owned process tree.
- Regression tests for these boundaries, including real child startup and cleanup.

## Verification

Observed locally on Windows, Node v26.0.0. Linux/Node 20 CI is not proven by these
runs. Detailed local logs are under `research/oct11/publish-verification/` and
are deliberately not published.

Published-code checks:
- Fresh uncached workspace build: **20/20 tasks passed**, exit 0. The approval
  follow-up was finished afterward; the final tools source was rebuilt with its
  own project configuration, exit 0, and exercised via built public exports.
- Full tools-suite final rerun: **337 passed, 1 skipped, 0 failed** across
  31 passing test files, exit 0. No test deadlines were relaxed for this rerun.
- Six new approval-mutation/fail-closed regressions: reproduced RED, then all six
  passed after repair. Independent scoped re-review returned PASS with no
  security or logic blockers.
- All changed source/test files passed ESLint with exit 0. The one unused-import
  warning was removed; the edited test file then passed ESLint without output.
- Final built-package smoke passed: actual child startup, environment isolation,
  denied sibling cwd, and denied overwrite retry without changing original data.
- Built CLI `--help` exited 0. This is a startup check, not a live coding task.
- The first full suite had **327 passed, 4 failed, 1 skipped** under severe host
  load. Failures included existing Git-test timeouts and startup deadlines.
  A later focused run exposed a Windows-only test/quoting problem; environment
  tests now execute fixture files, assert exit 0 and positive expected output.
- GitNexus staged impact reports CRITICAL shared-tool reach. That is a
  blast-radius warning, not proof of a regression or a runtime guarantee; the
  runtime checks and remaining acceptance limits are recorded separately.

Unpublished worktree checks (passing checks do not imply integration):
- Parallel: **25 passed**, including ordinary real-Git isolation/merge/conflict
  and cancellation tests; core project typecheck exited 0.
- Completion/core: **38 passed, 1 failed**; project typecheck and real-shell
  completion smoke exited 0. The failing assertion expects `done` while the
  revised evidence gate returns `needs_user`; it remains unresolved.
- CLI adapter/controller boundaries: **5 passed**, project typecheck exit 0.
  These do not prove the default TUI `/goal` or a complete workflow lifecycle.
- LSP: **12 passed**, including six real TypeScript-server tests. Its own build
  and the tools consumer typecheck against its local declarations exited 0.

Reproducible root checks (run from the repository root):

```sh
pnpm exec turbo run build --force --concurrency=1
node node_modules/typescript/bin/tsc -p packages/chimera-tools/tsconfig.json
node node_modules/vitest/vitest.mjs run --root packages/chimera-tools --pool=forks --maxWorkers=1 --minWorkers=1
node packages/chimera-cli/dist/index.js --help
```

The published regression suite is self-contained; local research scripts are
additional evidence, not required by the package tests.

## Unfinished work (not included in this checkpoint's code)

### Completion, review, and repair — `.worktrees/daily-core`
- [ ] Integrate the evidence-based completion gate and canonical shell-tool
  lookup after independent review and complete core regression coverage.
- [ ] Resolve the reviewer-verdict test that expects reviewer PASS alone to
  produce `done`; do not remove the evidence requirement to satisfy it.
- [ ] Reconcile returned result, emitted events, and persisted session state,
  including delegated/degraded/error and early blocked paths.
- [ ] Prove cancellation and cost admission for dynamically selected providers,
  deliberation internals, child runs, and the actual provider transport.
- [ ] Repair the current delegated caller: it discards its signal and constructs
  the coordinator without tool dependencies. New spawner APIs alone do not fix it.
- [ ] Complete shared budget admission/reservations, unknown-pricing handling,
  transient-only provider retries, and safe/idempotent tool retry rules.
- [ ] Preserve tool-call pairing through transcript compaction and checkpoints;
  resume spend, evidence, and pending work without replaying completed writes.
- [ ] Wire the existing bounded repair loop; stopping honestly on failed
  verification is implemented in the worktree, but automatic repair is not.
- [ ] Review whole-workspace fingerprint costs, generated-file exclusions,
  conservative pending-tool accounting, and unsupported overlapping runs.
- [ ] Review recurrence-based memory changes and their tests; connect extraction,
  recall, dreaming, and durable session behavior to the real runtime.

### Parallel agents — `.worktrees/daily-parallel`
- [ ] Finish independent review and integrate dependency validation, bounded
  shared-loop execution, cancellation, and per-child tool contexts.
- [x] Verify unresolved tool failures cannot be erased by unrelated successes;
  retries retain their original worktree; late allocation remains reported.
- [x] Rerun the standard real-Git tests: they now pass in the focused run.
  Earlier wall-clock timeouts remain evidence of load-sensitive verification;
  this is not an integrated or sustained-concurrency acceptance result.
- [ ] Check compatibility with the revised core tool loop, real write isolation,
  explicit branch/path reporting, and preservation of unfinished patches.
- [ ] Exercise user-facing create/list/run, concurrency, dependency failure,
  depth/iteration limits, cancellation, and read-only scopes end to end.

### CLI, TUI, providers, and workflows — `.worktrees/daily-cli`
- [ ] Integrate the provider adapter's cancellation/options/pricing/cache-usage
  forwarding after review; forwarding is not transport cancellation proof.
- [ ] Preserve camelCase tool-result IDs/names and all assistant-call shapes in
  normal and fallback adapters; handle malformed tool-argument JSON explicitly.
- [ ] Forward verification for ordinary run/agent paths, not only goal; enforce
  the displayed goal iteration limit rather than merely printing it.
- [ ] Supply the existing `runTask` callback to the actual TUI command context;
  `/goal` is not complete while the default UI cannot call the real runner.
- [ ] Finish quoted `/goal --verify` parsing and behavioral tests for both
  slash-command and command-line entry points.
- [ ] Prove goal deadlines, budgets, verification forwarding, failure statuses,
  repair/stop behavior, and session/progress persistence.
- [ ] Verify workflow create/list/run through Commander and the interactive
  surface, project-local YAML discovery, preservation of built-ins, invalid
  input rejection, real provider/tool execution, and visible failure results.
- [ ] Review the remaining runtime/help/evaluation/tool-context extraction and
  smoke-script edits before integration; typechecking alone is insufficient.
- [ ] Initialize runtime for subcommands as well as the default action; reconcile
  lightweight help and RPC/operational mode flags. Verify automatic permission
  transitions, real evaluation recording, unknown usage, and mock smoke labels.
- [ ] Replace the daemon's empty writer with real execution and use consistent
  tool permissions, mode, memory, and session context across all surfaces.

### Language-server intelligence — `.worktrees/daily-lsp`
- [ ] Integrate the revised LSP and tools together, avoiding stale root `dist`
  when verifying worktree sources.
- [ ] Audit CLI direct LSP construction for workspace trust enforcement; tool
  registry checks alone do not cover that separate startup path.
- [ ] Complete the startup/containment/unavailable and fresh-document review.
  Recheck diagnostic notification races, repeated workspace-symbol startup,
  concurrent registry initialization, and process shutdown/kill escalation.
- [ ] Prove bounded hung-request handling and exact owned-server PID cleanup.
- [ ] Review `didClose`, workspace folders, initialization options, and the
  trust-awareness of the synchronous server availability probe.

### Whole-system acceptance
- [ ] Integrate only reviewed slices; rerun full relevant core/tools/CLI/TUI/
  daemon/workflow/LSP suites and an uncached build of the combined revision.
- [ ] Run a real provider-backed coding task in a disposable Git repository and
  validate the artifact externally, rather than trusting model prose.
- [ ] Run intentional failed checks, permission denial, provider failure,
  cancellation, and bounded recovery; none may be reported as successful work.
- [ ] Exercise goal, custom workflow, parallel children, live LSP, and restart
  persistence through the normal user entry points.
- [ ] Reassess the prior baseline core failures (memory recurrence contract and
  a workflow wall-clock assertion) without silently weakening tests.

## Preservation

Incomplete implementations remain uncommitted in their named local worktrees;
they are not backed up by pushing this checkpoint. Pre-existing `AGENTS.md` and
`CLAUDE.md` edits, research logs, worker scratch files, credentials, and generated
build artifacts are excluded from the publication. No worktree is deleted.
The `daily-tools` worktree is an earlier safety draft: the published root adds
later approval-snapshot and test repairs. Do not overwrite it from that draft.

## Additional safety limits still open

- [ ] Test absolute paths expressed through the original workspace junction;
  relative paths are covered, but absolute alias compatibility remains incomplete.
- [ ] Handle a shell that exits before its descendants and before cancellation;
  the tested Windows tree cleanup assumes the owning shell PID is still present.
- [ ] Bound and surface cleanup failures from the Windows taskkill invocation.
- [ ] Fix Windows command quoting for inline commands such as `node -e` with
  quoted JavaScript. Reproduced syntax/empty-output failures; running the same
  JavaScript from a file succeeds. The shell argument construction is unchanged
  from the baseline. Environment tests use files and require successful startup.
- [ ] Make a pending interactive approval prompt respond immediately to abort;
  checking the signal after the prompt prevents dispatch but does not close it.
- [ ] Make process-startup tests reliable under severe CPU/memory contention
  without weakening their requirement to observe real startup and termination.
