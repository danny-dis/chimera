# Brief: wire objective grading + multi-run median into the matrix harness

Repo: `~/Documents/projects/chimera`. Target file: **`scripts/matrix-disk.mjs`** only
(plus a small edit to `scripts/score-combo.mjs` if needed). Do NOT touch `packages/`.

## Context

`scripts/matrix-disk.mjs` is the 30-combo mode×preset quality gate. Two HIGH bugs remain
(see `TODO.md` BUG-2, BUG-3, BUG-4):

- Its benchmark tasks are trivial (9/30 combos are "reply with PONG"), so multi-agent
  presets have no room to beat solo.
- `quality` is a completion rubric (finished + wrote a file + no error event), not a
  measure of whether the code works.
- Results are not reproducible: ±6 combos across three runs on one commit. A single pass
  is not a quality gate.

## Already built and PASSING — do not rewrite these

- **`scripts/task-suite.mjs`** — exports `TASKS`, `GRADEABLE`, `promptFor(mode)`.
  Three real tasks with hidden tests: `code` (slugify, 10 assertions), `debug` (stats.js
  with TWO bugs, one subtle, 7 assertions), `code_multi` (two files that must agree, 6
  assertions).
- **`scripts/grade-task.mjs`** — exports `gradeTask(mode, workdir)` →
  `{ gradeable, targetExists, passed, total, ratio, failures[], loadError }`,
  plus `seedTask(mode, workdir)` and `validateJsFiles(workdir)`.
- **`scripts/test-grade-task.mjs`** — offline discrimination proof. Run it:
  `node scripts/test-grade-task.mjs` → currently **ALL PASS**. It must still pass when
  you are done.

Verified discrimination: correct 1.00 / careless 0.30 / subtle-miss 0.86 / mismatch 0.50 /
unloadable 0.00.

## Task 1 — wire objective grading into the harness

In `scripts/matrix-disk.mjs`:

1. Import `promptFor`, `GRADEABLE`, `TASKS` from `./task-suite.mjs` and `gradeTask`,
   `seedTask`, `validateJsFiles` from `./grade-task.mjs`.
2. `taskFor(mode)`: for `code` and `debug`, return `promptFor(mode)` instead of the old
   trivial strings. Add a new mode `code_multi` to the task map. Keep `ask`, `plan`,
   `review`, `oal`, `auto` prompts as they are.
3. Replace the `seedDebug(workdir)` call with `seedTask(mode, workdir)` (it seeds the buggy
   `stats.js` for `debug` and nothing for other modes). Delete the old `seedDebug` and the
   old `bug.js` seeding.
4. Replace the local `validateJs()` with the imported `validateJsFiles()`.
5. After the run, for gradeable modes call `gradeTask(mode, workdir)` and put the result on
   the record as `grade`. **Set `rec.quality = grade.ratio`** for gradeable modes so the
   headline number is objective. Non-gradeable modes (`ask`/`plan`/`review`/`oal`/`auto`)
   keep the existing `scoreCombo(...)` rubric — but record `rec.scoreKind` as
   `'objective'` or `'rubric'` so the two are never averaged blindly.
6. The disk/`brokenDone`/`unrunnableDone` guards must keep working. Grade the workdir
   BEFORE the `rmSync` cleanup.
7. `VALID` combos: add `code_multi` paired with the same presets as `code`
   (`auto solo duo trio fusion hive swarm`).
8. Per-combo log line: append `grade=<passed>/<total>` for gradeable rows.

## Task 2 — `RUNS=n` multi-run median (BUG-2)

1. Read `const RUNS = Number(process.env.RUNS || 1)`.
2. Run the whole combo list `RUNS` times. Tag each record with `run` (1-based).
3. Aggregate per `mode/preset` across runs: **median** quality, min, max, and
   `spread = max - min`. Report median as the headline, never a single sample.
4. Print a `=== REPRODUCIBILITY ===` section listing any combo whose status was not
   identical across all runs (these are the flaky ones), and the count of such combos.
5. Solo-vs-multi comparison must use the per-combo **medians**, still excluding
   `failureClass === 'infra'` rows, and must print n for each side.
6. Artifact: keep writing `scripts/matrix-disk-results.json` for a full run and
   `scripts/matrix-disk-results-smoke.json` when `COMBO=` is set (this guard already
   exists — do not regress it). Include `runs`, the flat `results` array with `run` tags,
   and an `aggregates` object keyed `"mode/preset"`.
7. Default `RUNS=1` must behave like today (no behavioural change when unset).

## Constraints

- Node ESM `.mjs`, CommonJS `require` via the existing `createRequire`. Match existing style.
- Do not change provider/gateway wiring, `buildRegistry`, or the adapter functions.
- Do not delete the existing infra-vs-capability bucketing, the `writeErrors` reporting, or
  the smoke-artifact guard — all three are recent fixes.
- Keep the in-summary caveat text, but update it: `quality` is now objective for gradeable
  modes, so the caveat should say the RUBRIC applies only to non-gradeable modes.

## Definition of done

Run these and paste real output:

```bash
node --check scripts/matrix-disk.mjs
node scripts/test-grade-task.mjs      # must be ALL PASS
node scripts/test-score-swarm.mjs     # must be ALL PASS
COMBO=code/solo node scripts/matrix-disk.mjs      # must print grade=n/10
RUNS=2 COMBO=code/solo node scripts/matrix-disk.mjs   # must print median + spread
```

Confirm `scripts/matrix-disk-results.json` still has its 30 rows afterwards
(`md5sum` before/after) — a smoke run must never overwrite it.

Do not commit. Leave changes in the working tree and report what you changed.
