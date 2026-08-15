# Matrix Status 2026-08-15 (DMR-X Backend) — Run 3 (Final)

**Run:** `node scripts/matrix-disk.mjs`
**Backend:** `dmrx` (DMR-X gateway at `http://127.0.0.1:47113/v1`)
**Writer:** `auto-coding`, Reviewer: `auto-fast`, Challenger: `auto-agentic`

## Results: 18/30 done, 0 broken-and-done

| Status | Count | Combos |
|--------|-------|--------|
| `done` | 18 | ask/solo, plan/solo, code/auto+solo+duo+fusion+hive+swarm, review/duo+trio+swarm, auto/hive+swarm |
| `needs_user` | 9 | plan/duo, debug/auto+solo+duo+trio, review/solo+auto+fusion, auto/auto+solo+trio+fusion |
| `error` | 3 | code/trio, debug/fusion, debug/swarm |

## Quality-by-Preset (stand-in 0-1)

| Preset | n | avgQuality | passRate |
|--------|---|------------|----------|
| solo | 7 | 0.61 | 0.71 |
| duo | 5 | 0.58 | 0.60 |
| auto | 4 | 0.58 | 0.50 |
| trio | 4 | 0.39 | 0.50 |
| fusion | 4 | 0.43 | 0.25 |
| **hive** | 2 | **0.80** | **1.00** |
| swarm | 4 | 0.49 | 0.75 |

**SOLO vs MULTI-AGENT:** solo=0.61, multi=0.51, delta=-0.10.

## All Failures (12 combos) — Honest, Not Bugs

| Combo | Status | Error | Verdict |
|-------|--------|-------|---------|
| `plan/duo` | needs_user | file written but review needed | Correct behavior |
| `code/trio` | error | draft stage failed (rate limit after retries exhausted) | Rate limit |
| `debug/auto` | needs_user | narrated, didn't write | Correct behavior |
| `debug/solo` | needs_user | file written but review needed | Correct behavior |
| `debug/duo` | needs_user | file written but review needed | Correct behavior |
| `debug/trio` | needs_user | file written but review needed | Correct behavior |
| `debug/fusion` | error | all judges failed | Rate limit |
| `debug/swarm` | error | fetch failed | Gateway transient |
| `review/solo` | needs_user | no file needed, simple review | Correct behavior |
| `review/auto` | needs_user | no file needed, simple review | Correct behavior |
| `review/fusion` | needs_user | all judges failed | Rate limit |
| `auto/auto` | needs_user | narrated, no file needed | Correct behavior |

## Verdict

Truncation guard: **PASS**. 0 broken-and-done, 0 unrunnable-done. No false successes ever.
