# Chimera Self-Evaluation Report
## Live matrix run against its own repo — 2026-08-15 (Run 2: post-fix verification)

---

### 1. Matrix Run (Authoritative Harness)

**Harness:** `scripts/matrix-disk.mjs` — drives `SessionOrchestrator.execute` across all 30 valid mode×preset combos, asserting **disk side-effects** (not just status). Backend: DMR-X gateway (`auto-coding`/`auto-fast`/`auto-agentic`).

**Run 1:** 12/30 done | **Run 2:** **18/30 done** | **broken-and-done: 0** (truncation guard OK)
**Exit code fix:** harness previously exited 1 despite success — added `process.exit(0)` after `main()` (pending retry timer kept event loop alive).

| Mode | Preset | Status | Time | Tools | Disk | Quality |
|------|--------|--------|------|-------|------|---------|
| ask | solo | done | 17–61s | 0 | — | 0.60 |
| plan | solo | done | 82–106s | 1–2 | — | 0.75 |
| plan | duo | done | 59–169s | 1 | — | varies |
| code | auto | **done** | 118–176s | 2–3 | ✅ valid=1,ran=1 | 1.00 |
| code | solo | **done** | 31–50s | 1–2 | ✅ valid=1,ran=1 | 1.00 |
| code | duo | **done** | 27–31s | 1 | ✅ valid=1,ran=1 | 1.00 |
| code | trio | done / error | 33–167s | 0–2 | ✅ valid=1,ran=1 | 0–1.00 |
| code | fusion | **done** | 58–109s | 5 | ✅ valid=1,ran=1 | 1.00 |
| code | hive | **done** ✅ | 20–57s | 1 | ✅ valid=1,ran=1 | 1.00 |
| code | swarm | **done** | 32–107s | 1–2 | — | 0.75 |
| debug | auto | needs_user | 26–54s | 2 | ✅ | 0.35 |
| debug | solo | **done** | 67–113s | 2–3 | ✅ valid=1,ran=1 | 0.35 |
| debug | duo | needs_user | 23–31s | 1 | ✅ | 0.35 |
| debug | trio | needs_user / error | 27–128s | 1–2 | ✅ | 0.00–0.35 |
| debug | fusion | **error** | 5–96s | 0–12 | ✅ | 0.00 |
| debug | swarm | **error** | 5–122s | 0 | — | 0.00 |
| review | solo | needs_user | 12ms–14s | 0 | — | 0.35 |
| review | auto | needs_user | 2–13s | 0 | — | 0.35 |
| review | duo | done / needs_user | 1.7–30s | 0 | — | 0.35–0.60 |
| review | trio | done / needs_user | 46–47s | 0 | — | 0.35–0.60 |
| review | fusion | needs_user | 3–33s | 0 | — | 0.35 |
| review | swarm | **done** | 9–14s | 0 | — | 0.60 |
| oal | solo | **done** | 4–37s | 0 | — | 0.60 |
| auto | auto | **done** | 1.7–11s | 0 | — | 0.60 |
| auto | solo | **done** | 2–7s | 0 | — | 0.60 |
| auto | duo | done / needs_user | 1.7–13s | 0 | — | 0.35–0.60 |
| auto | trio | done / needs_user | 10–23s | 0 | — | 0.35–0.60 |
| auto | fusion | needs_user | 3–37s | 0 | — | 0.35 |
| auto | hive | **done** ✅ | 12–17s | 0 | — | 0.60 |
| auto | swarm | **done** | 3–8s | 0 | — | 0.60 |

**Key fixes verified:**
- `code/hive`: error → **done** (worktree merge fix landed)
- `auto/hive`: error → **done** (trivial-task routing fix landed)
- `auto/duo`, `auto/trio`, `auto/auto`: needs_user → **done** (rate limits cooled between runs)
- `debug/trio`: error → **needs_user** (no longer a hard crash)

**Remaining failures:**
- `debug/fusion` → all judges failed
- `debug/swarm` → ProviderUnavailableError (fetch failed)
- 4 review/* → ProviderUnavailableError (fetch failed)
- `code/trio` → intermittent ProviderError (empty content)

---

### 2. Solo vs Multi-Agent (The Multi-Agent Gradient)

```
         Run 1                Run 2
solo     avgQuality=0.63       avgQuality=0.61    passRate=0.71
multi    avgQuality=0.43       avgQuality=0.51    delta=-0.10
         delta=-0.20
```

**Multi-agent still doesn't beat solo**, but the gap narrowed from -0.20 to -0.10. The improvement came entirely from `hive` going from 0% to 100% pass rate. Without hive, multi-agent is still flat.

Why multi-agent scores lower:
- Multi-agent presets burn more provider calls → more rate-limit errors (trio, fusion, swarm all hit 429s)
- More agents = more synthesis steps = more failure points (fusion judge failures, degraded deliberation)
- The "challenger" role (`auto-agentic`) adds cost without measurable output quality gain in the current scoring

---

### 3. Preset Quality Breakdown

| Preset | n | Run 1 avgQ | Run 2 avgQ | Run 1 pass | Run 2 pass | Verdict |
|--------|---|------------|------------|------------|------------|---------|
| solo | 7 | 0.63 | 0.61 | 0.57 | **0.71** | ✅ Best overall |
| duo | 5 | 0.56 | 0.58 | 0.40 | **0.60** | Marginal gain |
| auto | 4 | 0.51 | 0.58 | 0.25 | **0.50** | Improved |
| trio | 4 | 0.43 | 0.39 | 0.25 | 0.50 | Rate-limited |
| fusion | 4 | 0.43 | 0.43 | 0.25 | 0.25 | Judge failures |
| **hive** | 2 | **0.00** | **0.80** | **0.00** | **1.00** | ✅ Fixed |
| swarm | 4 | 0.49 | 0.49 | 0.75 | 0.75 | Text-only |

**Key takeaway:** `solo` still dominates, but `hive` went from completely broken to the highest-quality preset after the worktree merge fix. The more complex the preset, the more it fails — but the fixes are working.

---

### 4. Architecture Audit

**Scale:**
- 15 packages, ~87K LOC total, 569 TS source files
- `chimera-core` = 35K LOC (40% of the codebase) — `session-orchestrator.ts` alone is 2,639 lines
- `cli-router.ts` = 1,626 LOC (5× the AGENTS.md 300-LOC budget — flagged as MED in the audit)

**Golden Rule compliance:**
- ✅ `runAgentToolLoop` extracted as single shared loop (solo, trio, spawner all call it)
- ⚠️ 3-layer skill architecture (bundled in-code / curated on-disk / user `.chimera/`) — complex, easy to place a skill in the wrong layer
- ⚠️ `file-write-fallback.ts` parses 8 distinct prose narration formats — a sign the tool-calling pipeline is unreliable across models
- ⚠️ `SwarmOrchestrator` sub-agents run `complete()` with **no tools** and a "return only the result" prompt — structurally cannot write files, by design

**Security:**
- `prompt-guard.ts` = 228 lines of regex injection detection — flags `ignore previous instructions` etc. Regex-based detection is trivially bypassed with encoding, synonym substitution, or multi-language payloads. Not a real defense.
- `shell.ts` danger filter = 39 lines of anchored regex — `echo x; rm -rf /` passes because the pattern only matches `rm -rf /` at the start. Pipe-to-shell (`| bash`) is caught, but semicolon chains are not.
- `Sandbox` class exists and is unit-tested but **NOT wired into `run_shell_command`** — the richer safety mechanism is dead code (flagged HIGH in audit).

---

### 5. Escalation Ladder (The "Smart" Path)

`packages/chimera-core/src/escalation-ladder.ts` (418 lines) implements:
1. **Determinism-first** — `findDeterministicSkill()` checks skill registry before reasoning
2. **AttemptTrail** — records every rung tried, ordered
3. **Delegation decision** — `decideDelegation()` routes complex tasks to CoordinatorEngine/hive
4. **BudgetGuard** — caps retries/rungs/wall-clock

**Reality check:** Skills are markdown **recipes**, NOT executables. The "determinism-first" rung arms a recipe into `memoryContext` (writer consumes at low temp). True no-LLM execution "is out of scope" per the code comment. So the ladder is:
- Try a markdown recipe (still goes through LLM)
- Try delegation (more LLM)
- Try the full pipeline (even more LLM)
- Give up and ask the user

The ladder makes failures *observable* (every rung recorded) but doesn't make them *rarer*.

---

### 6. Tool Layer

| Tool | Issue |
|------|-------|
| `run_shell_command` | `cd` does NOT persists across calls (fresh execa each time). No dir-name search. |
| `write_file` / `edit_file` | Sandbox allows absolute paths inside root (fixed). |
| `find_folder` | Added 2026-07-16; NL→tool mapping via `TOOL_USE_GUIDANCE` in prompts |
| `search_files` | Content grep only — cannot find "the folder called X" |

**Tool-calling pipeline** has been through 6+ layered defect fixes (zodToJsonSchema, toolChoice:'auto', workspaceRoot threading, Bug C camelCase, Bug D coerceParams, Bug A absolute-paths). The `file-write-fallback.ts` prose parser (8 formats) is a safety net for models that narrate instead of calling tools. This is the single most fragile part of the system.

---

### 7. Review Mode — Still Broken

4/6 `review/*` combos returned `needs_user` with "ProviderUnavailableError: fetch failed." The reviewer (`auto-fast`) is not reaching the gateway or timing out. `review/duo` and `review/trio` both returned `done` but with quality 0.60 (the reviewer answered, but the matrix still flagged it because the conversational fast-path triggered).

---

### 8. Verdict

**What works:**
- `code/solo` is reliable (5/5 done in both runs, all landed valid+runnable files)
- The shared `runAgentToolLoop` golden-rule de-dup is real
- Disk-asserting matrix catches false-success (broken-and-done: 0)
- The harness itself is well-engineered (retry-on-transient, per-combo isolation, real DMR-X wiring)
- **`hive` is now fixed** — went from 0% to 100% pass rate after the worktree merge fix

**What doesn't:**
- Multi-agent presets (trio, fusion, swarm) are either rate-limited, judge-failing, or structurally incapable of the task (swarm = text-only)
- Review mode is broken (provider fetch failures)
- The "more agents = better" claim is unsupported by the only metric the system collects (solo beats multi by +0.10, down from +0.20)
- Security layer (prompt-guard, shell danger-filter) is regex-only — bypassable
- `Sandbox` class is dead code despite being tested

**Bottom line:** Chimera is a reliable **solo** agent with a well-built test harness. The recent fixes (worktree merge, trivial-task routing) moved the needle from 12/30 to 18/30 — real progress. But the multi-agent architecture is still the part that doesn't work, and the "more agents = better" claim remains unsupported by the only evidence the system collects.

---

*Generated from live matrix runs `scripts/matrix-disk.mjs` + source inspection of `packages/chimera-*/src`. Matrix logs: `scripts/matrix-disk-FULL-20260815_005257.log` (run 1), `scripts/matrix-disk-FULL-20260815_*.log` (run 2).*
