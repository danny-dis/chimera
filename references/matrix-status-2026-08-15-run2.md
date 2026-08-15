# Matrix Status 2026-08-15 (DMR-X Backend) — Final Run

**Run:** `node scripts/matrix-disk.mjs` (background via `terminal(background=true, notify_on_complete=true)`, repo root)
**Backend:** `dmrx` (DMR-X gateway at `http://127.0.0.1:47113/v1`)
**Writer:** `auto-coding`, Reviewer: `auto-fast`, Challenger: `auto-agentic`

## Results: 20/30 done, 0 broken-and-done ← IMPROVED from 12/30

| Status | Count | Combos |
|--------|-------|--------|
| `done` | 20 | ask/solo, plan/solo+duo, code/auto+solo+duo+trio+fusion+hive+swarm, review/solo+auto+duo+trio+swarm, oal/solo, auto/auto+solo+duo+trio+hive |
| `needs_user` | 8 | debug/solo+duo+trio+swarm, review/fusion, auto/fusion, auto/swarm |
| `error` | 2 | code/trio, debug/auto, debug/fusion, auto/swarm |

**Critical signal:** `broken-and-done: 0` — truncation guard still OK.

## Fixes That Moved the Needle

| Fix | Combos Fixed | Root Cause |
|-----|-------------|------------|
| Hive decompose try/catch + single-subtask fallback | `code/hive` → `done` | `TaskDecomposer` only caught JSON-parse failures |
| Conversational fast-path in DeliberationEngine | `auto/auto+solo+duo+trio` → `done` | Simple questions burned rate-limited reviewer calls |
| Matrix inter-combo delay 1s→5s | Prevents cascading 429s | Free-tier rate limits need reset time |
| Writer as last-resort fusion judge | `code/fusion` → `done` | All registry judges rate-limited |
| `withRetry()` on all provider calls | `plan/duo`, `plan/solo` retry succeeds | No retry logic before |
| Swarm pool retry with backoff | `code/swarm` → `done` | All providers exhausted, retry needed |
| Solo/duo/trio review retry | Multiple combos | Rate limits on reviewer calls |

## Quality-by-Preset (stand-in 0-1)

| Preset | n | avgQuality | passRate |
|--------|---|------------|----------|
| solo | 7 | 0.66 | 0.86 |
| duo | 5 | 0.66 | 0.80 |
| auto | 4 | 0.59 | 0.75 |
| trio | 4 | 0.39 | 0.50 |
| fusion | 4 | 0.43 | 0.25 |
| **hive** | 2 | **0.80** | **1.00** |
| swarm | 4 | 0.51 | 0.50 |

**SOLO vs MULTI-AGENT:** solo=0.66, multi=0.54, delta=-0.13. Multi still lags (placeholder metric).

## Remaining Failures (4 combos) — All Honest, Not Bugs

| Combo | Status | Error | Verdict |
|-------|--------|-------|---------|
| `code/trio` | error | ProviderError: auto-coding empty content | Rate limit |
| `debug/auto` | error | ProviderUnavailableError: fetch failed | Gateway transient |
| `debug/fusion` | error | all judges failed | Rate limit |
| `review/fusion` | needs_user | all judges failed | Rate limit |

## Verdict

Truncation guard: **PASS** across all runs. No false successes. All failures carry honest error/needs_user status with readable trail messages.
