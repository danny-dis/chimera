# Daily-driver handover

## Start here

Chimera is NOT proven reliable for unattended daily use. Automation was left paused;
no resume, push or merge was performed. Ponytail full remains the working style:
trace the real flow, reproduce first, make the smallest shared-path fix, and verify
actual artifacts rather than model/reviewer prose.

Repository: `C:/Users/pc/Documents/projects/chimera`.
Branch at handover: `feat/chimera-next-generation-coding-agent`.
Parent revision of this checkpoint: `177dcaa`.
The commit containing this document saves the completed core and acceptance slice;
it intentionally does not include the unfinished Windows shell work below.

## Saved implementation

- `packages/chimera-core/src/coordinator/agent-tool-loop.ts`: path-scoped
  `edit_block`, `search_replace`, and `apply_patch` mutations participate in existing
  file accounting. No-op edits do not count; successful edits avoid forced rewrites.
- The shared loop executes the final emitted tool batch without another model
  completion. Cancellation is checked before that final batch executes.
- `packages/chimera-core/src/coordinator/duo-executor.ts`: writable writers receive
  normalized tool definitions on their first request; reviewers do not receive them.
- `packages/chimera-core/src/coordinator/__tests__/daily-file-mutations.test.ts`:
  eight focused mutation, final-batch, cancellation and initial-tool regressions.
- `scripts/test-live-mode-presets.cjs`: current-run report replaces stale results;
  config/spawn/cleanup errors are recorded as failures, verifier execution is bounded,
  and startup/timeouts cannot count as an expected failing seed.
- `scripts/check-acceptance-accounting.cjs`: controlled failure-accounting checks
  plus a real hanging verifier rejected at its deadline.

## Evidence and limits

Evidence paths below are LOCAL, intentionally uncommitted; they remain on this machine.
They are not included in a clone or guaranteed to survive local cleanup.

- Latest pre-commit run: **46 passed, 3 failed**, 11 test files. All 43 core cases
  passed; both quoting cases and raw-spawn ownership passed. Three shell ownership
  cases missed startup markers under their original bounds. No deadline was relaxed.
  Log: `.agent-logs/handover-precommit-tests.log`.
- Earlier wider Windows/tool/LSP rerun: **156 passed** in 21 test files.
  `.agent-logs/daily-windows-after.log`. That green rerun does not erase the fresh
  startup failures or establish cold/load-sensitive reliability.
- Fresh core/tools builds and CLI project typecheck exited 0 in the separate
  handover verification command. The first command chain stopped at its failed
  native tests; its subsequent builds/checks were not executed.
- Scoped TypeScript ESLint exited 0: no errors, two existing unused-import warnings
  in `duo-executor.ts`. Local log: `.agent-logs/handover-lint.log`.
- Fresh `check-acceptance-accounting.cjs`, `check-live-mode-presets.cjs`, and
  `check-live-repo-feature.cjs` all exited 0 after the builds. Controlled positive,
  stale/error, planning, verifier, and mutation cases passed their expectations.
  These are offline harness checks, not live provider or preset certification.
- Prior built-runtime solo accepted the existing two-file CommonJS feature:
  `.agent-logs/daily-live-r2-solo/repo-feature-results.json`: exit 0, `done`,
  independent artifact execution passed, verifier untouched, no unexpected paths.
- Duo failed twice on the same feature:
  `.agent-logs/daily-live-r2-duo/repo-feature-results.json` and
  `.agent-logs/daily-live-r3-duo/repo-feature-results.json`: exit 1, `needs_user`,
  independent artifact execution failed with `TypeError: m.calc is not a function`;
  verifier untouched and no unexpected paths. Repair changed the public export.
- The first duo run had outstanding tool work; the final-batch regression reproduced
  and fixed that specific defect. The two later failures are incorrect artifacts,
  not proof that the final-batch fix failed.
- These live runs used `177dcaa` plus the dirty tree, including Windows WIP; they
  are NOT certification of this clean commit in isolation. No new live run was
  launched just to prepare the handover.
- Requested preset was recorded; executed-preset telemetry remains unproven.
  One small passing solo feature is not all-mode, repository-scale or cost evidence.
- A delegated review failed without a usable result; it is not a passing review.
  GitNexus previously reported HIGH shared execution reach. The index can be stale;
  staged change detection is a scope check, not proof of runtime safety.
- Pathless multi-file patches are not covered by the path-scoped mutation tests;
  boundary snapshots cannot detect unobserved edit-and-restore or provide isolation.

## Uncommitted Windows work: preserve, do not call complete

- `packages/chimera-tools/src/tools/shell.ts`: mixed Windows Job Object/quoting
  integration and shell failure/cancel/deadline hardening. Some controlled checks
  passed, but native startup is still failing intermittently. The whole mixed file
  remains WIP rather than staging an untested synthetic partial version.
- `packages/chimera-tools/src/__tests__/shell-orphan-ownership.real.test.ts`:
  latest failures at startup assertions (shell owner death and both orphan stdio
  variants), not successful verification of descendant cleanup in those cases.
- `packages/chimera-tools/src/__tests__/shell-quoting.real.test.ts`.
- `scripts/check-shell-failures.cjs`, `scripts/check-shell-lightweight.cjs`,
  `scripts/check-windows-owner.cjs`.
- Other pre-existing local work remains untouched: `AGENTS.md`, `CLAUDE.md`,
  `.agent-briefs/usability-1014/`, `.agent-logs/`, `packages/chimera-lsp/evidence/`,
  `research/`, and `tasks/`. Do not blanket-stage or delete these directories.

## Next session

1. Inspect `git status` and this document before changing anything. Preserve WIP.
2. Diagnose the Windows startup failures using positive ready markers and exact
   owned-PID cleanup. Do not increase deadlines merely to obtain a green run.
3. Trace duo's bad export repair end to end. Each result JSON names its exact
   `logFile`; read the corresponding log next to it. Inspect `calc.js`/`mathops.js`
   tool arguments and verifier feedback before changing prompts or budgets. The
   precise reason duo chose the bad repair is not yet established.
4. Reproduce the cause with a focused regression, then fix the shared path; retain
   caller-owned verifier hashes and independent artifact checks.
5. Rebuild dependency outputs before CLI runs: consumers resolve sibling `dist`.
   Re-run the same bounded solo/duo task in unique evidence directories. Keep
   automation paused until repeated representative tasks pass without rescue.

## Commands (Git Bash, repository root)

Use native forward-slash paths with native Windows programs. The verified Node
executable for these runs was `C:/Program Files/nodejs/node.exe` (v24.15.0 in live
provenance); verify current runtime rather than assuming shell `node` matches.

```sh
"C:/Program Files/nodejs/node.exe" node_modules/typescript/bin/tsc -p packages/chimera-core/tsconfig.json
"C:/Program Files/nodejs/node.exe" node_modules/typescript/bin/tsc -p packages/chimera-tools/tsconfig.json
"C:/Program Files/nodejs/node.exe" node_modules/typescript/bin/tsc --noEmit -p packages/chimera-cli/tsconfig.json
"C:/Program Files/nodejs/node.exe" scripts/check-acceptance-accounting.cjs
"C:/Program Files/nodejs/node.exe" scripts/check-live-mode-presets.cjs
"C:/Program Files/nodejs/node.exe" scripts/check-live-repo-feature.cjs
"C:/Program Files/nodejs/node.exe" node_modules/vitest/vitest.mjs run packages/chimera-core/src/coordinator/__tests__/daily-file-mutations.test.ts --maxWorkers=1 --minWorkers=1
COMBO=code/duo CHIMERA_ACCEPTANCE_DIR=C:/Users/pc/Documents/projects/chimera/.agent-logs/next-session-duo-001 "C:/Program Files/nodejs/node.exe" scripts/test-live-mode-presets.cjs --repo-feature
```

Use a fresh acceptance directory each time. Run long commands in the background,
retain actual exit codes, and do not treat `needs_user` as successful completion.
