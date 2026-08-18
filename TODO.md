# Chimera — Task Board

Single source of truth for in-progress, pending, and recently completed work.
Multiple agents work this repo in parallel.

**Rules**
1. Before starting: find the item, set status `🔨 Working`, put your identifier in **Agent**.
2. Finishing: set `✅ Done`, add finish date, link the commit in **Notes**.
3. Abandoning: set back to `🔲 Pending`, clear **Agent**.
4. Never take an item already `🔨 Working` without coordinating with that agent.
5. Found a bug? Log it in **Backlog / Discovered Bugs** with file:line + severity.

---

## Active

| # | Item | Status | Agent | Started | Notes |
|---|------|--------|-------|---------|-------|
| 1 | Harness triage hardening: smoke-artifact guard, infra-vs-capability buckets, writeErrors reporting | ✅ Done | hermes-longcat | 2026-08-18 | `scripts/matrix-disk.mjs`. Verified live via `COMBO=code/solo` |
| 2 | Replace near-trivial benchmark tasks with tasks a reviewer can actually catch | 🔲 Pending | | | See BUG-3. Blocks any credible solo-vs-multi claim |
| 3 | Multi-run median mode (`RUNS=n`) + variance reporting | 🔲 Pending | | | See BUG-2. n=1 is not a quality gate |
| 4 | Wire a real LLM judge, or rename `quality` → `completionScore` | 🔲 Pending | | | See BUG-4 |
| 5 | Fix `debug/*` non-solo presets bailing to `needs_user` | 🔲 Pending | | | 5/5 non-solo debug combos affected — structural, not flake |

---

## Recently Completed

| Item | Finished | Commit | Notes |
|------|----------|--------|-------|
| Wire taskRouter + model registry so multi-model presets run | 2026-08-18 | `a603379` | Fixed duo `modelA=modelB="default"` and fusion `no panel models available` |
| Repair rotted harness (`ModelRegistry is not a constructor`) | 2026-08-18 | — | Broken by `72b668d` metadata-subsystem removal |
| Harness triage hardening (item 1) | 2026-08-18 | pending | Smoke guard + failure buckets + writeErrors surfaced |

---

## Backlog / Discovered Bugs

### BUG-1 — `COMBO=` smoke run destroyed the full-run artifact — **HIGH** — FIXED 2026-08-18
`scripts/matrix-disk.mjs:~346` (`main()`) unconditionally wrote
`scripts/matrix-disk-results.json`, so a documented 1-combo smoke test replaced the
committed 30-row record with a single row. Recoverable only because the file is
git-tracked. The skill doc *recommends* smoke tests, so following the docs corrupted
data. **Fixed:** smoke runs now write `matrix-disk-results-smoke.json`.

### BUG-2 — Matrix results are not reproducible; variance swamps signal — **HIGH**
Three runs on the same commit (`a603379`) within ~80 minutes:

| Run | Outcome |
|---|---|
| 19:35 `matrix-postfix-20260818.log` | duo/fusion still `modelA=modelB="default"` |
| 20:36 `matrix-final-20260818.log` | **19/30** done, 3 hard `ProviderUnavailableError: fetch failed` |
| 20:55 `matrix-disk-results.json` | **25/30** done, 0 errors |

±6 combos apart. Single-combo re-runs also disagreed with the record (`code/duo`
returned `needs_user`, not `done`). At n=2–7 rows per preset, all preset-vs-preset
comparison is noise, and the committed 25/30 is the luckiest of three.
**Fix:** add `RUNS=n`, report median + spread, never quote a single pass.

### BUG-3 — Benchmark tasks cannot measure multi-agent value — **HIGH**
`scripts/matrix-disk.mjs:171` `taskFor()`:
- `ask` / `auto` → *"Reply with exactly the single word: PONG"* (**9 of 30 combos**)
- `code` → `greet(name)` returning `"Hello, " + name`
- `debug` → change `a + b` to `a - b`
- `review` → one-line `divide(a,b){ return a*b; }`

Only 13 of 30 rows touch disk. A cheap-writer + frontier-reviewer architecture cannot
beat solo on `return "Hello, " + name` — there is no defect for a reviewer to catch.
"Multi-agent doesn't beat solo" is therefore a benchmark artifact, not a product
finding. Needs tasks with an off-by-one, a missed null case, and 2–3 coordinated files.

### BUG-4 — `quality` is a completion rubric, not a quality judgement — **MEDIUM**
`scripts/score-combo.mjs` is 8 lines: `0.5 base +0.25 file exists & unbroken +0.15 used
a tool +0.10 no error events`. So hive's headline **0.88 "quality"** only means *"it
finished, wrote a file, emitted no error event"* — nothing about whether the code was
good. The file admits the LLM-judge path is unwired. Every recorded solo-vs-multi
gradient (incl. the −0.09 delta) is unmeasured.
**Mitigated:** summary now prints an explicit caveat. Real fix = judge or rename.

### BUG-5 — `writeErrors` collected then silently discarded — **MEDIUM** — FIXED 2026-08-18
`matrix-disk.mjs:218,224` counted `writeErrors` per combo but never asserted on or
printed it: 18 write errors across the 20:55 run went unreported. **Fixed:** summary now
prints a per-combo breakdown. First run after the fix showed `code/solo` reporting
`done` with `quality=1.00` **while emitting 2 tool error events** — exactly the class of
silent failure this hid.

### BUG-6 — `results.json` lost the failure text — **LOW** — FIXED 2026-08-18
Rows carried `error: None` while the real `ERR:` string existed only in the `.log`, so a
run could not be triaged from the JSON alone. **Fixed:** rows now carry `errorText` and
`failureClass`.

### BUG-7 — All non-solo `debug` presets bail to `needs_user` — **MEDIUM**
`debug/auto`, `debug/duo`, `debug/trio`, `debug/fusion`, `debug/swarm` — 5/5 in the
20:55 run. Consistent across runs, so structural rather than flaky. Each still wrote
valid runnable files to disk (`debug/fusion` wrote 6), so the work happens but the
completion path gives up.

### BUG-8 — Harness is outside typecheck and CI — **MEDIUM**
`matrix-disk.mjs` is a standalone `.mjs` against built `dist/`, so core refactors break
it invisibly (`72b668d` did exactly that, and the stale `18/30` score survived for weeks
because nobody could run it). Needs a CI smoke step — `COMBO=code/solo` is now safe to
run in CI since it no longer clobbers the artifact.
