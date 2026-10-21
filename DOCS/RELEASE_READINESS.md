# v0.6.0 release readiness

Status: release preparation in progress. The candidate package version is 0.6.0.
No release is published. Current local checks and historical checkpoints are
reported separately.

## Current local candidate

The working-tree candidate passed the serial 20-package build, workspace
typecheck, lint and build-integrity check on Node.js 24.15.0. The full test run
reported 2,772 passed and one skipped, with all 20 package outcomes accounted for.
Turbo replayed cached tasks where valid; this is not a fresh execution of every
unchanged test. Build integrity checked 1,520 artifacts.

The focused checks passed 13 LSP cases and 40 Core cases, including cancellation
usage settlement and the corrected strict-review fixture. The complete Tools
suite passed its unchanged Windows caller-death, natural-orphan and quoting
checks. Earlier startup and suite failures remain in the historical record.

All 14 runtime packages packed and installed in a fresh consumer. Version,
installed command shim, separate-project launcher, help, sessions, workflow
listing and the required 10-second real shell check passed. A local runtime
archive and SHA-256 checksum were generated. The documentation-only repack and
independent extracted-bundle check passed, including a frozen dependency install,
installed command, separate-project launcher, real shell output and unchanged
consumer manifests. Release regressions, 33 offline coverage cases and smoke
regressions passed. The fresh production audit reported no known vulnerabilities.

These local checks do not establish a public release. The Windows sandbox
failure was traced to Turbo strict mode dropping `PSModulePath`, making PowerShell
cmdlet discovery take tens of seconds. An in-worker probe separated Execa loading
(124 ms) from first output (28.7 seconds). Passing through `LOCALAPPDATA` did not
help and was removed. Preserving only `PSModulePath` reduced the sandbox suite
from 118.3 to 11.0 seconds and stderr capture from 22.4 seconds to 640 ms, without
changing assertions or deadlines. Linux CI, Windows CI and E2E smoke passed the
[module-path trial](https://github.com/danny-dis/chimera/actions/runs/39588856776).
Temporary probes are removed; check the PR's current-head results separately.

The investigation also reproduced blocked parent environment variables reaching
sandbox children because Execa merged the parent environment back in. All sandbox
Execa launches now disable that merge. A real-child sentinel regression failed
before the repair and passed afterward while explicitly supplied variables still
arrived. Focused Node 22 checks passed 23 tests with one existing Windows skip.
macOS sandbox and Docker execution were not exercised locally.

A separate full local Node 22 Tools run reported 354 passed, three LSP failures,
one skipped and two stream errors. Its Bun-installed dependency tree supplies an
`.exe` server launcher, but the pinned-pnpm fixture requires `.CMD`. No assertion
or timeout was changed to mask that installation mismatch. Remote CI uses the
committed pnpm setup.

Commit and push are authorized; publication remains separate. Previously committed
real credentials still need owner revocation; deleting files leaves Git history
intact.

A live PONG check through the accepted extracted bundle failed with
`ProviderUnavailableError`; the public CLI returned `needs_user` and exit 1.
The conditional coding case was not run. All three resolved role endpoints use
local port 47113, which refused connections on the follow-up health check. Its
earlier HTTP 200 response is historical, not current availability. No provider
settings or external service were changed. Fresh live coding and all 29
mode/preset combinations remain blocked; unattended reliability is not certified.

## Earlier v0.6.0 preparation checkpoints


These earlier checkpoints preceded the current local candidate. Their failed
runs are preserved below; use the current section for the latest local status.

- Removed obsolete merge snapshots, scratch fixtures and credential-bearing
  diagnostics after byte-verifying a private recovery archive. Any real keys
  committed previously need revocation; deleting files leaves Git history intact.
  Existing regression diagnostics and unfinished research remain preserved.
- The installer checks Node 22.13 and pnpm 11.0.8, uses frozen installs and links
  the CLI package. Full source-install acceptance remains pending.
- Frozen installation, an uncached 20-package build, full lint with warnings and
  a production audit reporting zero vulnerabilities passed. After the lifetime
  repair, workspace typecheck passed across 20 packages; build integrity passed
  for 1,520 artifacts. The full test run stopped at two LSP cleanup-test failures
  (101 other LSP tests passed), leaving later packages uncleared. Unchanged narrow
  repeats passed on Node 26.7.0. They do not establish the cause of the original
  Node 24 failure or replace full-suite acceptance. No LSP test or deadline changed.
- The Windows host pins its actual caller handle, checks full creation ticks and
  liveness before target startup, and closes its private job after caller death.
  A real-caller differential probe left the original child alive beyond 1,500 ms;
  the repair reaped it in 807 ms with over 44 seconds left on its finite watchdog.
  Its longer diagnostic startup allowance does not satisfy native acceptance.
- Native shell results were 5/7: three caller-death variants and both quoting
  cases passed. Two natural-orphan cases failed their unchanged 5-second startup
  checks, including an isolated repeat. Static revision review approved all six
  current runtime source hashes. The startup failures remain unresolved.
- All 14 runtime packages packed with content checks. A fresh online consumer
  installed and passed version, command-shim, project-launcher, help, sessions and
  workflow-list checks, then failed its required 10-second shell check. No release
  archive was emitted. First-time consumer resolution now uses normal registry
  access; a frozen workspace install does not supply every required metadata entry.
- The harness now supplies a real caller-owned verifier and protects its bytes
  plus the deterministic grading runner. Its original missing-verifier run was
  correctly rejected. The repaired in-repo run passed with executed verification,
  `status=done` and all seven grading checks, without relaxing the completion gate.
- Release publication now pins the validated commit with a non-force tag push
  after package acceptance, then requires an exact or peeled remote SHA match.
  Both successful and failed pushes require that final check. In-repo regressions
  passed nine valid and 16 invalid versions, six early-tag cases, 16 late-pin cases,
  two producer interleavings and real local Git positive/conflict cases. Downloads
  remain independent of optional npm publication. No public tag was created.
- Credential-free E2E uses deterministic checks. Unavailable-network and zero-pass
  live smoke runs fail. Five smoke regressions, 33 offline coverage cases and the
  source-driver check for 29 combinations passed. These do not certify live coding.

A complete workspace run, unchanged native deadlines, extracted/downloaded bundle
acceptance and the live contract below must pass before this release is certified.

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
