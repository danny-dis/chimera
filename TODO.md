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
| 2 | Replace near-trivial benchmark tasks with tasks a reviewer can actually catch | ✅ Done | hermes-longcat | 2026-08-18 | BUG-3. `task-suite.mjs`: slugify (10 hidden tests), stats.js with TWO bugs (7), cross-file `code_multi` (6). Live: `debug/solo` scored **6/7** — missed the subtle empty-array bug the old rubric scored 1.00 |
| 3 | Multi-run median mode (`RUNS=n`) + variance reporting | ✅ Done | hermes-longcat | 2026-08-18 | BUG-2. `RUNS=n` env var, per-combo median/min/max/spread, `=== REPRODUCIBILITY ===` section listing status-unstable and quality-varying combos. `RUNS=1` warns that variance is unmeasured |
| 4 | Objective grading instead of a completion rubric | ✅ Done | hermes-longcat | 2026-08-18 | BUG-4. Solved better than an LLM judge: `grade-task.mjs` runs hidden tests in a subprocess; `quality` = pass ratio for gradeable modes. `scoreKind` marks objective vs rubric so they are never averaged blindly |
| 5 | Fix `debug/*` non-solo presets bailing to `needs_user` | 🔲 Pending | | | 5/5 non-solo debug combos affected — structural, not flake |

---

## Recently Completed

| Item | Finished | Commit | Notes |
|------|----------|--------|-------|
| Wire taskRouter + model registry so multi-model presets run | 2026-08-18 | `a603379` | Fixed duo `modelA=modelB="default"` and fusion `no panel models available` |
| Repair rotted harness (`ModelRegistry is not a constructor`) | 2026-08-18 | — | Broken by `72b668d` metadata-subsystem removal |
| Harness triage hardening (item 1) | 2026-08-18 | pending | Smoke guard + failure buckets + writeErrors surfaced |

---

## Live Gateway Test Results — 2026-08-18 (Post-Restart)

**Gateway restarted:** `apps/gateway` → `bun src/main.ts` (picked up new catalog)
**Change:** Removed retired `gemini-2.0-flash` from catalog + native adapter map.

| Provider | Model | Status | Response |
|----------|-------|--------|----------|
| google | gemini-3.6-flash | ✅ 200 | "Pong" |
| google | gemini-2.0-flash (retired) | ✅ 200 | "pong" (fallback chain mapped to live model) |
| cohere | command-r | ✅ 200 | "pong" |
| mistral | codestral-2508 | ✅ 200 | "pong" |
| nvidia-nim | meta/llama-3.2-11b | ✅ 200 | "It looks like you sent" |
| codestral-free | codestral-2508 | ❌ 502 | "All providers failed" (dead key) |
| gitlawb | xiaomi/mimo-v2.5 | ❌ 502 | "All providers failed" (host unreachable) |
| openrouter-free | openrouter/auto | ❌ 502 | "All providers failed" (dead key) |
| tokenrouter | auto | ❌ 503 | "All providers currently unavailable" (empty key in .env) |

**Post-restart improvement:** 5/9 working (vs 4/9 before). Google, Mistral, and the retired-model fallback all recovered.

### Remaining failures

| Provider | Root Cause | Fix |
|----------|-----------|-----|
| codestral-free | Dead API key | Remove from `.env` or replace key |
| gitlawb | `api.gitlawb.ai` unreachable (timeout) | Check DNS/firewall or remove |
| openrouter-free | Dead API key | Remove from `.env` or replace key |
| tokenrouter | Empty `TOKENROUTER_API_KEY=` in .env | Set a key or remove the provider |

**Gateway:** `http://127.0.0.1:47113/v1` | **Auth:** `Bearer dmrx-local-admin-key-2026`
**Script:** `test_all_providers.py` | **Payload:** `{model, messages:[{role:"user",content:"ping"}], max_tokens:5}`

| Provider | Model | Status | Latency | Response |
|----------|-------|--------|---------|----------|
| cohere | cohere/command-r-plus | ✅ OK | 5281ms | "Pong" |
| mistral | mistral/codestral-2508 | ✅ OK | 9125ms | "你好！我是DeepSe" |
| nvidia-nim | nvidia-nim/llama-3.1-8b-instruct | ✅ OK | 42719ms | "你好！我是 DeepSe" |
| opencode-zen | opencode-zen/nemotron-3-ultra-free | ✅ OK | 12859ms | "The user said \"ping" |
| codestral-free | codestral-free/codestral-2508 | ❌ 502 | 2281ms | "All providers failed" |
| gitlawb | gitlawb/tencent/hy3 | ❌ 502 | 2813ms | "All providers failed" |
| google | google/gemini-2.0-flash | ❌ 503 | 2234ms | "All providers currently unavailable" |
| openrouter-free | openrouter-free/openrouter/auto | ❌ 502 | 2250ms | "All providers failed" |
| tokenrouter | tokenrouter/auto | ❌ 502 | 11000ms | "All providers failed" |

### Failure Analysis

- **502 "All providers failed"** (codestral-free, gitlawb, openrouter-free, tokenrouter): Aggregator/multi-provider routes where every upstream failed. Not a gateway bug — the underlying provider tokens are dead or rate-limited.
- **503 google/gemini-2.0-flash**: The dual-adapter (google + google_native) is fully down. This is the primary provider for chimera operations — see BUG-9.
- **Chinese-language replies** (mistral, nvidia-nim): Gateway is routing to Chinese-optimized model variants. "你好！我是DeepSe" = "Hello! I'm DeepSe". Likely upstream model auto-detection ignoring the request's actual model target.
- **42.7s nvidia-nim**: Extremely slow — either cold-start or upstream throttling.

### Failure Documentation

| Failure | Type | Severity | Evidence |
|---------|------|----------|----------|
| google 503 | Provider outage | **HIGH** | Primary chimera provider unreachable; dual-adapter both paths failing |
| codestral-free 502 | Dead token | MEDIUM | "All providers failed" — upstream token expired/revoked |
| gitlawb 502 | Dead token | MEDIUM | "All providers failed" — tencent/hy3 route dead |
| openrouter-free 502 | Dead token | MEDIUM | "All providers failed" — openrouter/auto route dead |
| tokenrouter 502 | Dead token | LOW | "All providers failed" — aggregator with no live upstreams |
| mistral Chinese reply | Model routing | LOW | Responded in Chinese to English "ping" — wrong model variant served |
| nvidia-nim 42s latency | Performance | MEDIUM | 42719ms for 5 tokens — cold start or upstream throttle |

---

## Backlog / Discovered Bugs

### BUG-1 — `COMBO=` smoke run destroyed the full-run artifact — **HIGH** — FIXED 2026-08-18
`scripts/matrix-disk.mjs:~346` (`main()`) unconditionally wrote
`scripts/matrix-disk-results.json`, so a documented 1-combo smoke test replaced the
committed 30-row record with a single row. Recoverable only because the file is
git-tracked. The skill doc *recommends* smoke tests, so following the docs corrupted
data. **Fixed:** smoke runs now write `matrix-disk-results-smoke.json`.

### BUG-2 — Matrix results are not reproducible; variance swamps signal — **HIGH** — TOOLING FIXED 2026-08-18
Three runs on the same commit (`a603379`) within ~80 minutes:

| Run | Outcome |
|---|---|
| 19:35 `matrix-postfix-20260818.log` | duo/fusion still `modelA=modelB="default"` |
| 20:36 `matrix-final-20260818.log` | **19/30** done, 3 hard `ProviderUnavailableError: fetch failed` |
| 20:55 `matrix-disk-results.json` | **25/30** done, 0 errors |

±6 combos apart. Single-combo re-runs also disagreed with the record (`code/duo`
returned `needs_user`, not `done`). At n=2–7 rows per preset, all preset-vs-preset
comparison is noise, and the committed 25/30 is the luckiest of three.
**Fixed (tooling):** `RUNS=n` runs the whole list n times, aggregates per-combo
median/min/max/spread, and prints `=== REPRODUCIBILITY ===` naming every
status-unstable and quality-varying combo. `RUNS=1` now states in-band that variance
is unmeasured. **Still open:** nobody has yet done a `RUNS=3` full pass to establish
the real median — that is the remaining work, and no score should be quoted until then.

### BUG-3 — Benchmark tasks cannot measure multi-agent value — **HIGH** — FIXED 2026-08-18
The old `taskFor()` used: `ask`/`auto` → *"Reply with exactly the single word: PONG"*
(**9 of 30 combos**), `code` → `greet(name)` returning `"Hello, " + name`, `debug` →
change `a + b` to `a - b`, `review` → one-line `divide(a,b){ return a*b; }`. Only 13 of
30 rows touched disk. A cheap-writer + frontier-reviewer architecture cannot beat solo
on `return "Hello, " + name` — there is no defect for a reviewer to catch, so
"multi-agent doesn't beat solo" was a benchmark artifact, not a product finding.

**Fixed:** `scripts/task-suite.mjs` adds three real tasks, each with hidden tests the
model never sees:
- `code` — `slugify()` with 10 assertions (dash collapsing, trimming, non-string guards)
- `debug` — `stats.js` with **two** bugs: an obvious off-by-one and a subtle
  divide-by-zero on `[]`. 7 assertions, so catching only the obvious one scores <1.0
- `code_multi` — two files that must agree on export names (cross-file consistency,
  6 assertions) — a failure class the old suite never tested at all

**Live proof:** `debug/solo` scored **6/7** — the model fixed the off-by-one and
**missed the empty-array bug**. The old rubric scored exactly that artifact 1.00.

### BUG-4 — `quality` was a completion rubric, not a quality judgement — **MEDIUM** — FIXED 2026-08-18
`scripts/score-combo.mjs` is 8 lines: `0.5 base +0.25 file exists & unbroken +0.15 used
a tool +0.10 no error events`. So hive's headline **0.88 "quality"** only meant *"it
finished, wrote a file, emitted no error event"* — nothing about whether the code was
good.

**Fixed better than the original plan** (which was "wire an LLM judge or rename the
field"): `scripts/grade-task.mjs` runs the hidden tests against the artifact in a
**separate subprocess** (so a file that throws on load, hangs, or calls `process.exit`
cannot take the harness down) and `quality` becomes `passed/total`. No judge model
needed, no judge flakiness, fully offline-testable.

Rows now carry `scoreKind: 'objective' | 'rubric'` plus the original `rubricScore`, and
the summary reports the two **separately** so an objective score is never averaged with
a heuristic one. Non-gradeable modes (`ask`/`plan`/`review`/`oal`/`auto`) still use the
rubric — honestly labelled.

Discrimination is proven offline by `scripts/test-grade-task.mjs` (**ALL PASS**):

| artifact | old rubric | objective grade |
|---|---|---|
| correct slugify | 1.00 | **1.00** |
| careless slugify (no guards, no dash collapse) | 1.00 | **0.30** |
| debug: subtle bug missed | 1.00 | **0.86** |
| code_multi: files disagree on export name | 1.00 | **0.50** |
| parses but throws on load | 1.00 | **0.00** |

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

### BUG-9 — Google dual-adapter fully down (503) — **HIGH**
`google/gemini-2.0-flash` returned `503 All providers currently unavailable` via the DMR-X gateway. This is the primary chimera inference provider. Both the OpenAI-compatible adapter (`/v1beta/openai/chat/completions`) and the native streaming adapter (`streamGenerateContent?alt=sse`) are failing — the dual-adapter redundancy is not providing failover. Needs investigation: token expiry, upstream Google API outage, or gateway adapter bug.

### BUG-10 — Four aggregator providers returning 502 "All providers failed" — **MEDIUM**
`codestral-free`, `gitlawb`, `openrouter-free`, `tokenrouter` — all multi-provider routes where every upstream failed. Individual upstream tokens are dead or rate-limited. Not a gateway bug, but the gateway's 502 message obscures whether it's a token issue or an infrastructure issue. **Fix:** gateway should distinguish "no upstream could handle this" (token dead) from "gateway internal error".

### BUG-11 — Mistral and nvidia-nim responding in Chinese to English prompt — **LOW**
`mistral/codestral-2508` and `nvidia-nim/llama-3.1-8b-instruct` both replied "你好！我是DeepSe" to an English "ping". The gateway is routing to Chinese-optimized variants of these models. Either the upstream model selector is auto-detecting Chinese from the model name, or the gateway's model→upstream mapping is wrong.

### BUG-8 — Harness is outside typecheck and CI — **MEDIUM**
`matrix-disk.mjs` is a standalone `.mjs` against built `dist/`, so core refactors break
it invisibly (`72b668d` did exactly that, and the stale `18/30` score survived for weeks
because nobody could run it). Needs a CI smoke step — `COMBO=code/solo` is now safe to
run in CI since it no longer clobbers the artifact.
