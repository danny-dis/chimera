# Next release readiness

Status: BLOCKED — current package version is 0.5.7; no release has been published.

## Acceptance contract

- Exercise exactly the 29 combinations in `VALID_MODE_PRESET_COMBOS`, checked by
  `node scripts/test-live-mode-presets.cjs --list`.
- Retain requested, resolved and actually executed strategies separately. An
  advertised remap is not proof that the original strategy executed natively.
- Code/debug/OAL/auto coding must pass independent execution of caller-owned
  checks, preserve their bytes, and stay within the requested mutation scope.
- Ask/plan/review must return task-correct content without unauthorized mutations.
- Auto must solve a nontrivial coding case, not merely answer PONG.
- Long-running checks must traverse the production tool/model loop, inject
  recoverable failures, demonstrate progress and completion, and retain budgets,
  cancellation, bounded retries and explicit blocked states. A controlled endurance
  test is not an hours-long live-provider reliability claim.
- Demonstrate actual wired checkpoint/resume behavior separately from exported
  persistence primitives; do not claim restart safety without an exercised path.
- Windows positive startup, owner-death, descendant cleanup, quoted commands,
  timeout/cancel and output limits must pass unchanged native-test deadlines.
- Rebuild dependency outputs before live acceptance. Preserve exact revision,
  dirty scope, run IDs, child exits, logs and independent acceptance results.
- Builds, consumer typechecks, affected regressions, lint/security and scoped review
  must pass. A stale report, `needs_user`, timeout, verifier mutation or wrong
  artifact cannot count as successful unattended completion.

## Recovery pass (2026-10-19)

- Provider metadata/role mapping, fusion current-depth/judge failover and trio's
  missing strict-review output contract repaired in the preserved dirty tree.
- Owning builds and daemon/TUI consumer types passed. Final focused checks: 17/17.
- Earlier broader suite: 143 passed, 1 failed; unchanged trio smoke fixture emits
  invalid lowercase pass with no confidence. Its rejection must not be hidden.
- Offline acceptance and built 80-read transient-failure recovery check passed.
- Fresh strict public-CLI feature acceptance: trio/fusion/hive **0/3**, all needs_user,
  no implementation changes, original verifier intact and no unexpected mutations.
  All configured role endpoints point to local DMR-X port 47113, which is not
  listening; live runs recorded fetch failures before tools. This blocks live
  certification; no provider config or external service was changed.
- Hive direct dependency-result handoff repaired and verified: 46 checks passed,
  core emit/CLI typecheck/lint passed. Built prose-only no-op probe was correctly
  rejected by the existing caller verifier; no extra completion gate was added.
- Hive tool-availability limits, all 29 combinations, native Windows lifecycle,
  restart/resume and sustained unattended reliability remain open. No release or commit performed.

Evidence and exact live report IDs: `DAILY_DRIVER_HANDOVER.md`, recovery section.

## Resumed budget / live / restart evidence

- Fusion's tool-round budget is independent of recursion depth; rebuilt affected
  packages and 83 focused checks passed. Source remains ea996f3 plus dirty WIP.
- Gateway health is now okay, but configured model probes were mixed (writer 503,
  reviewer PONG, challenger probe deadline). Health is not model reliability.
- Fresh strict coding slices: solo/duo/fusion passed; trio/hive remained needs_user
  despite independently correct artifacts. Ask/solo control passed. This is not
  all-29 or representative repository-scale certification.
- Windows unchanged-deadline repeat: 2/6 passed, four startup/timing failures.
- Checkpoint read history and explicit resume --yolo forwarding repaired. Four
  controlled separate-process restart scenarios passed with original verifier
  hash/deadline retained; unapproved execution, verifier tampering and expired
  deadlines remained rejected. This uses an explicit checkpoint and controlled
  provider, not automatic mid-turn crash recovery, all-worker restart or exactly-once
  side effects. Fresh built 80-read recovery, offline coverage, lint and diff passed.
- A captured trio PASS record was fenced JSON. Whole-response fence handling is
  implemented without relaxing field validation; 100 final focused checks, core/CLI
  build, lint and all four restart scenarios passed. The fresh strict Trio slice
  passed its child, handler, verifier, artifact and mutation checks.
- A later solo repeat failed its actual artifact check (calc export broken) and
  correctly returned needs_user. Keep that failure alongside earlier solo passes.
- Exported Fusion cancellation reproduced five failures and was repaired at its
  checked completion and stage boundaries. Final builds, 175 tests in 24 files
  (including retry-backoff) and lint passed. The subsequent independent verifier
  process timed out at 5000ms in the restart repeat, so proc_a3f3816866ba stopped
  before the matrix. That native timing failure remains a release blocker.
  This does not certify remote cancellation/billing or every fallback side effect.
- Quiet prerequisite repeat passed the unchanged restart deadlines, 80-read recovery,
  offline coverage and diff checks; the earlier timeout remains unexplained evidence
  of timing variability. The full matrix subsequently completed in the saved report:
  **18/29 passed, 11 needs_user**, runId `00a47797-0577-4d75-9f06-87f599bad7b2`.
  Every protected verifier stayed unchanged and no broken artifact was reported done.
  This supersedes the stale 9/29 partial status, not the remaining release blockers.
- Failed combinations: code/{hive,swarm}; debug/{auto,trio,swarm};
  auto/{auto,solo,duo,trio,hive,swarm}. Several correct artifacts still failed accepted
  completion. Auto/solo broke the calc export; Auto/duo produced invalid JavaScript.
- Hive worker-round forwarding is NOT fixed: its pending regression has no verdict
  because process startup failed at high host memory. Keep it outside the completed
  commit and reproduce before implementation. No broad budget increase is approved.
- Precommit review blocked same-ID role routing, hard goal timeout settlement and
  delegated repair-diagnostic forwarding. Mixed CLI/orchestrator/provider files and
  dependent tests/drivers remain uncommitted; only the independently reviewed subset
  is saved. Fresh 190-test working-tree PASS does not override these untested edges.
- The completed-work checkpoint is a local save point, not release certification.
  Windows reliability, repeatable all-29 acceptance and sustained multi-day operation
  remain open; no push, merge, publish or automation resume performed. Historical
  results included preserved Windows WIP and do not certify the clean committed subset.
  Next phase: [stability plan](plans/2026-10-20-stability-next-phase.md).

## Latest verified checkpoint before this release pass (historical)

- Context forwarding and deferred LSP imports: built and tested locally.
- 162 focused regressions passed in 28 files; offline acceptance checks passed.
- Windows separate suite: 2 passed, 4 failed (startup/readiness and quoting timeout).
- Existing CommonJS feature: both latest duo runs passed all acceptance gates;
  solo produced a correct artifact but created unexpected `nNode.js` and was rejected.
- Static review found no actionable issue in those scoped fixes, not runtime certification.
- All 29 live release combinations and sustained autonomy: NOT YET VERIFIED.
- Working tree is uncommitted. No push, publish, merge or automation resume performed.

Current detailed evidence and preserved WIP: `DAILY_DRIVER_HANDOVER.md` and local
`.agent-logs/daily-context-*`. Release verdict must be refreshed from final runs.
