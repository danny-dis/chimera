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

### BUG-12 — `debug` score of 0.43 was the DO-NOTHING BASELINE, not a defect — **HIGH** — TOOLING FIXED 2026-08-19
Across **8 independent samples** (3 harness attempts + 2 salvaged `RUNS=3` runs) every
`debug` preset scored exactly **3/7 = 0.43** with **zero variance** — `solo`, `auto`, `duo`,
`trio` all identical. That looked like a rock-solid capability defect and was nearly filed
as one.

It is a **benchmark flaw**. Grading the untouched seed file proves it:
```
$ node --input-type=module -e "import {baselineFor} from './scripts/grade-task.mjs';
                              console.log(baselineFor('debug'))"
  { baselinePassed: 3, baselineTotal: 7, baselineRatio: 0.4285... }
  failures: lastIndex basic (got 3), lastIndex single (got 1),
            lastIndex empty (got 0), average empty (got NaN)
```
`stats.js` as seeded **already passes 3 of 7 assertions** (all four `average` non-empty
cases pass; only `lastIndex` ×3 and the empty-array case fail). So **0.43 means the model
changed nothing at all.**

Corroborating evidence that was in the logs the whole time: **`diskW=0` on nearly every
`debug` row** — `write_file` was never called. Combined with `disk.target=true valid=1
ran=1` (the seed is present and loads), the rows were reporting "the untouched seed file".

**Consequence:** every objective score is meaningless without its baseline. A raw ratio
cannot distinguish "fixed half the bugs" from "did nothing".

**Fix:** `baselineFor(mode)` in `grade-task.mjs` seeds a throwaway tmpdir, grades it, and
returns the do-nothing ratio (offline, no API calls). `matrix-disk.mjs` computes all
baselines at startup and records `grade.baselineRatio`, `grade.improvement`
(`ratio - baselineRatio`) and `grade.noChange` on every graded row; a `done` row scoring at
or below baseline is now pushed into `failures` as *"the artifact was likely never
modified"*. The console line shows `grade=3/7 (base 3/7, impr +0.00 NO-CHANGE)`.
Verified: baselines are `code 0/10`, `debug 3/7`, `code_multi 0/6`;
`node scripts/test-grade-task.mjs` still **ALL PASS**.

**Restates BUG-7:** the real `debug` finding is not "scores 0.43", it is **"never writes
the file and bails to `needs_user`"**. The score was a symptom.

### BUG-13 — Matrix `node` process dies silently at ~20–30 min — **HIGH** — MITIGATED 2026-08-19
Five consecutive attempts on 2026-08-19 all died with **no `FATAL`, no stack trace, and no
exit line**, at wildly different combos (37/37-then-nothing, 34, 10, **1**, 14 of 37):

| attempt | reached | wall |
|---|---|---|
| `RUNS=3` run 1 | 37/37 but summary never written | 31 min |
| `RUNS=3` run 2 | killed at combo 34 | 73 min |
| pass 1 (`RUNS=1`) | 10/37 | 21 min |
| pass 2 (`RUNS=1`) | **1/37** | <1 min |
| pass 3 (`RUNS=1`) | 14/37 | 29 min |

Ruled out: **not** heap exhaustion (node RSS 83 MB at death, nowhere near a limit);
**not** the wrapper/owner (happened under `terminal(background)` AND under a
scheduler-owned `cronjob`, so splitting `RUNS=3` into three resumable `RUNS=1` passes did
**not** help — wrong layer); **not** a crash (zero diagnostic output).

Prime suspect: **individual combos exceeding the harness's `timeoutMs: 120000`** by 3–5×.
Measured worst offenders: **585 s, 535 s, 494 s, 469 s, 337 s, 327 s** — i.e. provider calls
running ~5× past their configured timeout, so the timeout is not being enforced and
something upstream eventually severs the process. Correlates with provider health at
**20/117 (17.1%)**.

**Structural aggravator:** the harness only writes its artifact and summary **at the very
end of `main()`**, so a kill at combo 36 of 37 yields **zero** usable data. Run 1 completed
all 37 combos and still produced nothing — the numbers had to be re-parsed out of the
`.log`. **Fix needed: append each row to the artifact incrementally as it completes**, and
make `results.json` recoverable from a partial run.

**FIX (2026-08-19) — three parts, all verified live:**

1. **`COMBO_TIMEOUT_MS` (default 300000) — a hard wall-clock ceiling per combo.**
   Root cause identified: provider `timeoutMs` **is** enforced, but only per HTTP request
   (`AbortController` + `setTimeout(() => controller.abort())` in every provider). An
   agentic tool loop issues MANY sequential requests, each legitimately under 120 s, so the
   *combo* had no ceiling at all. `runWithCeiling()` races `orchestrator.execute` against a
   timer and returns a normal `error` row instead of drifting. A wall-clock timeout is
   deliberately **not retried** (it would burn another full ceiling). Rows carry
   `timedOut: true`, and the existing `/timed? ?out/i` pattern classifies them as **infra**,
   so they are excluded from the quality average.
   *Verified:* `COMBO_TIMEOUT_MS=30000 COMBO=code/trio` → `error (30016ms)`, correctly
   bucketed infra. The same combo previously ran **326 s** unbounded.

2. **Incremental persistence.** `flushArtifact()` writes the full artifact after **every**
   completed row, tagged `partial: true` until the summary is reached (then `partial: false`).
   *Verified:* killed a run mid-flight with `pkill` → artifact contained **2 usable rows**
   plus baselines and `partial: true`. Before this change the same kill produced **nothing**.

3. **`RESUME=1`.** Re-loads a partial artifact, keys recorded rows by
   `mode/preset#run`, and skips them. *Verified:* `RESUME: loaded 2 row(s); 2 combo(s)
   already complete, 35 remaining.`

The startup banner now prints `[comboTimeout=…ms]` and the do-nothing baselines
(`code=0/10 debug=3/7 code_multi=0/6`), so every log is self-documenting about how it was
scored. `node scripts/test-grade-task.mjs` → **ALL PASS** (no regression).

**Still open:** the *underlying* reason a long-lived `node` gets severed is not proven — the
ceiling makes it survivable rather than explaining it. Provider health at **20/117 (17.1%)**
remains the prime suspect and BUG-9/BUG-10 should be fixed before the next full pass.

**TIME_WAIT theory — DISPROVEN (2026-08-19), port exhaustion is NOT the cause.**

Commit `4795aa4` *"fix(dmrx): add keep-alive agent to prevent TIME_WAIT accumulation"*
landed during this investigation and matched the failure shape, so it was the lead
hypothesis: no keep-alive → a fresh socket per provider call → Windows' 16384-port
ephemeral range (49152–65535, 4-min TIME_WAIT) exhausts under a 37-combo agentic load
(~20–30 min to death, no JS exception). Tested live with `scripts/socket-load-probe.mjs`
and `scripts/gw-concurrency-probe.mjs`:

| probe | n | leaked to TIME_WAIT | result |
|---|---|---|---|
| sequential bare `fetch()` | 60 | **0** (total even dropped -2) | Node 24 global `fetch` already pools |
| concurrent batches (8×5) | 40 | **0** (delta 0) | gateway handles concurrency cleanly |
| 20 serial `auto-coding` | 20 | 0 | ok=20 fail=0 |
| 10 `auto-fast` + 10 `auto-agentic` | 20 | 0 | ok=20 fail=0 |

**Verdict:** port exhaustion does not happen on this Node build. `COMBO_TIMEOUT_MS` is
still a seatbelt (it bounds the 585 s combos), but the root cause of BUG-13 lies
elsewhere.

**The "17% healthy pool" was also a red herring.** All 105 "unhealthy" providers have
`consecutive_failures=0`, `last_health_check=null`, AND `hasKey=false` — they are
never-probed, credential-less catalogue entries the router never selects. The routing
pool the aliases actually use is healthy and fast (`gemini-3.1-flash-lite`, measured
6 ms/req). The pool-health slowdown I reported between run 1 and run 2 was therefore
not a dead-gateway effect — its cause is also unexplained.

**BUG-13 genuinely unexplained.** Ruled out: heap (83 MB RSS at death), the gateway
(proven healthy + concurrency-safe), and port exhaustion (proven not leaking). Best
remaining hypotheses: (a) a wall-clock limit imposed on scheduler-owned script
executions (would explain why a `cronjob` died at combo 1 of pass 2), or (b) a slow
resource leak inside long agentic combos (the 326 s / 534 s / 585 s combos) that only
surfaces cumulatively. The `COMBO_TIMEOUT_MS` seatbelt makes either survivable.

### BUG-7 — All non-solo `debug` presets bail to `needs_user` — **MEDIUM** — FIXED 2026-08-23
**RESOLVED** in commit `16c2542`. Root-cause chain (each link verified by deterministic
mock repro + instrumented live gateway trace):
1. Narrator models emit the fix as fenced prose instead of a `write_file` tool call.
2. `parseProseActions` recovered the write WITHOUT `overwrite:true`, so every write to
   a pre-existing (buggy seed) file failed with "overwrite is false" and retried into
   the same wall.
3. `executeProseActions` counted *attempted* writes, masking that nothing landed.
4. The gateway ignores OpenAI's nested `tool_choice` shape, so forced write_file turns
   free-formed `read_file` calls instead.
5. The final synthesized output carried the complete fixed code, but no safety net
   ran after synthesis to land it.

Fixes: prose writes now carry `overwrite:true`; `executeProseActions` counts only
disk-verified mtime/size mutations; `mapToolChoice` sends both canonical and shorthand
shapes; a last-resort prose-persistence net in `deliberationToOrchestratorResult` lands
parsed file ops before the completion gate resolves; the filesystem tool refuses
malformed JS via a syntax oracle (balanced braces alone missed `{ a, b; }`).

Live verification (`COMBO=debug/solo matrix-disk.mjs`): `done`, diskW=1, valid=1,
broken=0, hidden tests 6/7 vs 3/7 do-nothing baseline. Was: `needs_user`, diskW=0,
0/7 with "artifact did not load". Residual 1/7 miss is model quality (empty-array
guard in average()), not infrastructure.

<details><summary>Original finding (2026-08-19)</summary>
See BUG-12: the accompanying 0.43 score is the do-nothing baseline, so this is the *whole*
finding, not half of it. `diskW=0` on nearly every `debug` row confirms `write_file` is
never called — the agent does not "do the work then fail to report it", it **never edits the
file**. Note `debug/solo` also bails (`needs_user`, `diskW=0`) in 3 of 4 samples, so this is
**not** limited to non-solo presets as originally recorded.

`debug/auto`, `debug/duo`, `debug/trio`, `debug/fusion`, `debug/swarm` — 5/5 in the
20:55 run. Consistent across runs, so structural rather than flaky. Each still wrote
valid runnable files to disk (`debug/fusion` wrote 6), so the work happens but the
completion path gives up.
</details>

### BUG-9 — Google dual-adapter fully down (503) — **HIGH**
`google/gemini-2.0-flash` returned `503 All providers currently unavailable` via the DMR-X gateway. This is the primary chimera inference provider. Both the OpenAI-compatible adapter (`/v1beta/openai/chat/completions`) and the native streaming adapter (`streamGenerateContent?alt=sse`) are failing — the dual-adapter redundancy is not providing failover. Needs investigation: token expiry, upstream Google API outage, or gateway adapter bug.

### BUG-10 — Four aggregator providers returning 502 "All providers failed" — **MEDIUM**
`codestral-free`, `gitlawb`, `openrouter-free`, `tokenrouter` — all multi-provider routes where every upstream failed. Individual upstream tokens are dead or rate-limited. Not a gateway bug, but the gateway's 502 message obscures whether it's a token issue or an infrastructure issue. **Fix:** gateway should distinguish "no upstream could handle this" (token dead) from "gateway internal error".

### BUG-11 — Mistral and nvidia-nim responding in Chinese to English prompt — **LOW**
`mistral/codestral-2508` and `nvidia-nim/llama-3.1-8b-instruct` both replied "你好！我是DeepSe" to an English "ping". The gateway is routing to Chinese-optimized variants of these models. Either the upstream model selector is auto-detecting Chinese from the model name, or the gateway's model→upstream mapping is wrong.

### BUG-14 — Solo `code` edits of pre-existing files fail ~60–70% via live CLI — **HIGH** — FIXED 2026-08-24
Live smoke (`code` "edit calc.js: a-b → a+b", pre-existing seed): **3/8 → 4/8 → 8/8**
across three build iterations. Root causes, layered:

1. **Adapter dropped solo-mode tool-call history.** `agent-tool-loop` solo mode
   re-emits assistant turns under camelCase `toolCalls`, but cli-router's
   `adaptProvider` only mapped snake_case `tool_calls` — from turn 2 the upstream
   saw orphaned tool results, abandoned the protocol, and narrated pseudo-XML
   (the exact 2-turn death pattern). Adapter now accepts both shapes.
2. **Post-tool nudge forced premature synthesis.** The injected "#TOOL RESULTS
   RECEIVED# … you MUST synthesize" message killed the loop right after
   `read_file`. It now instructs: call more tools until changes are on disk;
   synthesize only then.
3. **Missing-flag write refusals were terminal.** `write_file` without
   `overwrite:true` on an existing file was refused and identically retried into
   the same wall; executor now self-heals that one case with one
   `overwrite:true` retry.
4. **Pathless writes had no target.** Weak models emit `write_file` with only
   `content`; when the task's target is extractable, the loop now injects
   `path` (+`overwrite`) deterministically before execution (also on forced
   tool_choice turns), emitting a `tool_call_repaired` event.
5. **Failure events were invisible in CLI output** — `tool_call_failed`,
   `tool_call_retry`, `tool_call_repaired`, `prose_fallback_landed` are now
   printed, so silent needs_user runs are debuggable.

Verified: direct orchestrator probe (`scripts/dd-edit-probe.mjs`) FIXED first
try; full batch 8/8 on disk; @chimera/core 710 tests + @chimera/tools 300
tests pass.

### BUG-8 — Harness is outside typecheck and CI — **MEDIUM** — FIXED 2026-08-23
`matrix-disk.mjs` is a standalone `.mjs` against built `dist/`, so core refactors break
it invisibly (`72b668d` did exactly that, and the stale `18/30` score survived for weeks
because nobody could run it). Needs a CI smoke step — `COMBO=code/solo` is now safe to
run in CI since it no longer clobbers the artifact.

<details><summary>Fix (commit c5beda6)</summary>

New `scripts/harness-smoke.mjs` (also `pnpm smoke:harness`), wired into `ci.yml`
after Test on both OS matrix legs. Runs the **real** matrix-disk pipeline
end-to-end against a scripted narrator mock provider — no network, no API keys,
~2s. Asserts exactly what rotted before:

1. All workspace requires in `matrix-disk.mjs` resolve (via chimera-cli dep
   context — pnpm workspace layout, not resolvable from `scripts/` itself).
2. `SessionOrchestrator` accepts positional tools; `toolExecutor` non-null.
3. Narrator-style prose output lands an actual file fix on disk through the
   prose-fallback chain (doubles as the BUG-7 regression guard).
4. `grade-task.mjs` scores a perfect artifact 7/7 and honestly reports a
   missing target.

Local: 6/6 assertions pass. CI will run it on every push/PR to main.

</details>
