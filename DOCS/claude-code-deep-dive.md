# Deep-Dive Report — Mining `yasasbanukaofficial/claude-code` into Chimera

**Date:** 2026-06-15
**Scope:** Identify what is transportable from the upstream repo into `C:\Users\pc\Documents\projects\chimera\`.
**Method:** Repo cloned to `/tmp/yasasbanuka-claude-code`. Two parallel audit agents (chimera implementation audit, target repo subsystem map) plus targeted spot-checks.

---

## ⚠️ Provenance & Ethics

The target repo is a **backup of leaked Anthropic Claude Code source** — exposed via a sourcemap in the npm-published `@anthropic-ai/claude-code` package on 2026-03-31 (discovered by `@Fried_rice`). The repo README is explicit that it ships the leak "for research purposes."

**This report concerns *patterns, architectures, algorithms, and design ideas* — not verbatim code.** When porting anything, we will:

1. Re-implement the pattern in chimera-idiomatic TypeScript.
2. Cite the source location as **inspiration**, not as a copy.
3. Avoid copying comment prose, internal codenames, or proprietary prompt text.
4. Honour each upstream project's original licence for any third-party dep (Ink, Yoga, ripgrep, etc.).

---

## TL;DR

- **Chimera is more real than its README claims, but its headline multi-agent differentiators are mostly unintegrated.** `chimera-core` has a working `SessionOrchestrator` (state machine, real LLM calls, tool loop, prompt-injection guard, cost tracking). `chimera-providers`, `chimera-tools`, `chimera-tui`, `chimera-cli` are production-quality. But: **Relay Racing, Handoff Protocol, AgentMesh quality gate, cost-aware routing, rate limiting, fallback chain, LSP, web search, eval harness, audit log, worktree isolation, agent-specific memory** are all either stubs or dead code today. Source audit: `chimera/AGENTS.md`, `chimera/chimera-agent-blueprint.md` vs. `chimera/packages/chimera-context/src/relay-racing.ts:33-221`, `handoff-protocol.ts:14-541`, `agent-mesh.ts:39-72`, `chimera-providers/src/budget-enforcer.ts:28-148`, `rate-limiter.ts:12-123`, `fallback-chain.ts:32-163`, `chimera-tools/src/tools/lsp.ts:22`.
- **The target repo is a goldmine of well-battle-tested patterns** for almost every one of those gaps. It is the actual production source of `claude-code`, so the patterns survived a year+ of production use by millions of users.
- **Highest-leverage ports** (signal/effort): context-engine wiring, multi-tier compaction, sideQuery channel, hooks system, tool interface upgrade, memory hierarchy + autoDream, MCP channel permissions, and migrations.
- **Defer / skip** (high effort or proprietary): KAIROS, ULTRAPLAN, voice, buddy (Tamagotchi), undercover, Remote Control bridge, Yoga binding work, Tamagotchi sprites.

---

## 1. What the Target Repo Actually Is

| Property | Value |
|---|---|
| Files | 1,884 `.ts/.tsx` |
| Entry | `src/main.tsx` — 4,683 lines, 808 KB (REPL + SDK-from-CLI fused) |
| Stack | Bun bundle, React + Yoga (Ink) TUI, MCP, OAuth, GrowthBook/Statsig |
| Notable subsystems | Coordinator (system-prompt based), Swarm (tmux/iTerm2/in-process), Tool system (40+ tools, 30-method `Tool<In,Out>` interface), QueryEngine (multi-tier compaction), autoDream (memory consolidation), MEMORY.md hierarchy, Skills, Bridge (Remote Control), Voice STT, Vim state machine, Plugins/Hooks, Migrations, Output styles, native modules (Yoga, file-index, color-diff) |
| Internal codenames present | "Tengu" (Statsig gate prefix), "Capybara" (model codename), "KAIROS", "ULTRAPLAN", "Fennec" (model) — surfaced via `src/utils/undercover.ts:42`, `src/migrations/migrateFennecToOpus.ts`, `src/services/voice.ts` |

Confirmed sizes (key files):
- `src/main.tsx` — 808 KB, 4,683 lines
- `src/QueryEngine.ts` — 1,295 lines
- `src/query.ts` — 1,729 lines
- `src/coordinator/coordinatorMode.ts` — 369 lines (smaller than the agent's initial estimate; system-prompt content with imports)
- `src/memdir/` — 1,736 lines across 8 files
- `src/services/autoDream/` — independent subsystem

---

## 2. The 8 Most-Transportable Patterns (with file:line)

These are the patterns a chimera reviewer should look at first. Each is battle-tested upstream and matches a known chimera gap.

### P1. **Multi-tier context compaction pipeline** — `src/query.ts:360-510`
Four independent, feature-gated modules compose in a fixed order: `HISTORY_SNIP` → `CACHED_MICROCOMPACT` → `REACTIVE_COMPACT` → `CONTEXT_COLLAPSE`, plus the always-on `autoCompact` and `microCompact`. `QueryDeps` makes each step dependency-injectable for testing. This is the production answer to chimera's "Relay Racing" dead code at `chimera-context/src/relay-racing.ts:33-221`.

### P2. **Coordinator-as-system-prompt** — `src/coordinator/coordinatorMode.ts:1-369`
The "coordinator" is *not* a runtime — it's a 369-line prompt that tells the main model how to be a delegator (`CLAUDE_CODE_COORDINATOR_MODE` env var flips the model into a different role). Clean, simple, cheap. Replace chimera's hard-coded writer→reviewer→challenger pipeline (`chimera-core/src/session-orchestrator.ts:312-447`) with this for sub-agent orchestration; keep the parallel sub-agent engine for explicit `parallel` subcommand work.

### P3. **Streaming tool executor with concurrency-safety partitioning** — `src/services/tools/StreamingToolExecutor.ts:1-200`
`partitionToolCalls` inspects each tool's `isConcurrencySafe(input)` declaratively, runs read-only tools in parallel, writes serially, kills siblings on error via a *child* abort controller (parent query is preserved). Direct fit for chimera's parallel sub-agent fanout (`coordinator-engine.ts` + `sub-agent-spawner.ts:1-124`).

### P4. **Memory hierarchy + sideQuery recall selector** — `src/memdir/` (1,736 lines)
Four-type taxonomy (`user`/`feedback`/`project`/`reference`) with `<scope>`, `<when_to_save>`, `<how_to_use>`, `<body_structure>` baked into the prompt. MEMORY.md capped at 200 lines / 25 KB. Query-time recall uses a **Sonnet sideQuery** that picks ≤5 files from a manifest; already-surfaced paths are filtered before the call to spend budget on fresh candidates. Directly improves chimera's `LongTermMemory` at `chimera-core/src/memory/long-term-memory.ts:1-224` and the unused `agent-memory.ts:34-144`.

### P5. **AutoDream — forked-subagent memory consolidation** — `src/services/autoDream/`
Background task that forks a subagent (so it doesn't share main context) to consolidate memories from past sessions. Gated by time-since-last + session count + lockfile; short-circuits when KAIROS or remote mode is active. No chimera equivalent exists.

### P6. **`sideQuery` LLM side-channel** — `src/utils/sideQuery.ts:1-100`
A cheap-LLM (Haiku default) call wrapper for memory recall, classification, and other background LLM calls. Standardised `querySource` for analytics + structured `output_format`. No chimera equivalent — currently chimera routes every LLM call through the orchestrator, including classification work that doesn't need a frontier model.

### P7. **`buildTool` with type-level default spread** — `src/Tool.ts:728`
The 30-method `Tool<In, Out>` interface has safe defaults for the 7 most-stubbed fields. The `BuiltTool<D>` type-level spread enforces defaults are filled. Comment: "fail-closed where it matters" — missing `isReadOnly` defaults to *false*. Chimera's `chimera-tools/src/tool-builder.ts:1-40` already follows a similar pattern; this is a richer upgrade.

### P8. **Hooks as a discriminated union + permission-rule `if`** — `src/schemas/hooks.ts:1-200`
Three hook kinds (`command` shell, `prompt` LLM eval, `http` webhook) sharing a `IfConditionSchema` with permission-rule syntax (`Bash(git *)`) that filters before spawning. Fields: `timeout`, `statusMessage` (spinner label), `once` (one-shot), `async` (non-blocking), `asyncRewake` (wake model on exit 2). Events: `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart/End`, `SubagentStart/Stop`, `TeammateIdle`, `TaskCreated/Completed`, `ConfigChange`, `CwdChanged`, `FileChanged`, `InstructionsLoaded`, `UserPromptSubmit`, `Setup`, plus more. No chimera equivalent.

---

## 3. Chimera Gap × Target Solution Cross-Reference

| # | Chimera gap (evidence) | Source pattern (file:line in target repo) | Effort | Value |
|---|---|---|---|---|
| G1 | `RelayRacing` dead code (`chimera-context/src/relay-racing.ts:33-221`, never imported) | Multi-tier compaction `query.ts:360-510` | M | **HIGH** — the marquee feature |
| G2 | `HandoffProtocol` dead code (`handoff-protocol.ts:14-541`, never imported) | `QueryGuard.ts:1-100` state machine + auto-compact hooks | M | HIGH |
| G3 | `AgentMesh.executeQualityGate` is stub (`agent-mesh.ts:39-72` returns `pass, ""`) | Coordinator prompt `coordinator/coordinatorMode.ts:1-369` | S | HIGH |
| G4 | `coordinator-engine.ts:99` `assignProviders` is a no-op | `StreamingToolExecutor` partition pattern + provider pool | S-M | HIGH |
| G5 | `CostTracker` records spend, `BudgetEnforcer` never blocks | Wire `budget-enforcer.ts:28-148` into `SessionOrchestrator` before LLM call | S | MED |
| G6 | `RateLimiter` real, not wired (`rate-limiter.ts:12-123`) | Wrap `ProviderFactory.buildProvider` with rate limiter; add sliding-window check in front of `complete()` | S | MED |
| G7 | `FallbackChain` real, not wired (`fallback-chain.ts:32-163`) | Same wiring as G6 | S | MED |
| G8 | `LSP` tool stub (`tools/lsp.ts:22` returns mock) | Replace with their LSP service client OR their native `file-index` for symbol lookup | L | MED |
| G9 | `websearch` stub (`tools/web.ts:115-121` returns "Example Search Result") | Replace with real Exa/Tavily/Brave client OR remove tool and document | S | MED |
| G10 | `chimera-eval` not exposed via CLI | Add `chimera eval` subcommand in `cli-router.ts` wrapping `EvalHarness.scoreTask` + a real judge LLM call (use `sideQuery`-style Haiku) | S | MED |
| G11 | `AuditLog` never written (`security/audit-log.ts:30-199`) | Add `logToolCall`/`logLLMCall` calls in `SessionOrchestrator.execute` | XS | MED |
| G12 | `context-engine.ts` (465 lines) never imported | Wire `LongTermMemory.retrieve` replacement with `buildContextPack` at orchestrator line 267 | S-M | HIGH |
| G13 | `context-budget.ts` dead | Wire into orchestrator's `getTools()` and prompt assembly | S | MED |
| G14 | `tool-context-relay.ts` dead | Wire into tool executor for `internal://relay-*` boxes | S | LOW |
| G15 | `agent-memory.ts` unused | Replace single-`LongTermMemory` model with agent-scoped + long-term split | S | MED |
| G16 | `worktree-isolation.ts` never used | Wire into `CoordinatorEngine` for `parallel` subcommand (per-subagent worktree) | S | MED |
| G17 | `SessionStore` dead (only `CheckpointStore` wired) | Add `chimera sessions list/show/delete/export/import/migrate` subcommands | S | LOW |
| G18 | `MockProvider` silently echoes when no keys | Remove silent fallback; require at least one provider in config (or print hard error to TUI) | XS | MED |
| G19 | No hooks/extension model | Add `Hooks` subsystem inspired by `schemas/hooks.ts` + `utils/hooks.ts` | M | **HIGH** |
| G20 | No first-class skills (only `tools/skill.ts` loader) | Refactor to first-class `Command` instances per `skills/loadSkillsDir.ts` | M | HIGH |
| G21 | No output styles | Port `outputStyles/loadOutputStylesDir.ts` (50 LOC + Zod frontmatter) | S | MED |
| G22 | No migrations | Port `migrations/` pattern (idempotent source-scoped functions at startup) | S | MED |
| G23 | No vim mode | `src/vim/` state machine in types — clean inspiration | L | LOW (cosmetic) |
| G24 | No voice | `src/services/voice.ts` + `voiceStreamSTT.ts` + `voiceKeyterms.ts` | XL | LOW (out of scope) |
| G25 | `OAL`/`OTB` modes undefined | Decide: implement or remove | XS | LOW |
| G26 | `SessionOrchestrator.exportState` returns empty stub (`session-orchestrator.ts:183-208`) | Implement real state capture in `exportState` | S | MED |
| G27 | Pino dependency unused in `chimera-cli/package.json:33` | Remove or use | XS | LOW |
| G28 | `coordinator-engine.ts:99` — `assignProviders` is no-op, all sub-tasks same provider | Multi-provider fanout; pool of providers per role | M | HIGH |

Total: **28 concrete ports**, ranging XS to XL effort, 14 of HIGH value.

---

## 4. What to Skip (and Why)

- **KAIROS** — proactive/autonomous mode. Locked behind `feature('KAIROS')`, requires extensive cloud infra (push notifications, PR webhooks, cron, monitor tool). Out of scope for a local CLI.
- **ULTRAPLAN** — cloud-backed plan mode that uses Anthropic's CCR. Proprietary; not portable.
- **Voice (STT)** — requires Deepgram API, WebSocket infra, native audio-capture NAPI binding. Hold for v-next.
- **Buddy (Tamagotchi)** — cosmetic. No business value; skip.
- **Undercover mode** — Ant-only, no use case for chimera users.
- **Bridge (Remote Control)** — Anthropic's web IDE integration. Out of scope.
- **Ink reconciler rewrite** — chimera already uses Ink. Don't replace what's working.
- **Yoga native binding work** — Ink handles this transitively.
- **moreright (speculative prefill)** — leaked file is a stub anyway. Skip.
- **Tamagotchi sprite data** — copyright on Anthropic's art. Skip.

---

## 5. Risks

1. **License / IP.** Porting patterns is fine; copying comment prose, internal codenames, or proprietary prompt text is not. Every file we open in `/tmp/yasasbanuka-claude-code/` should be treated as *inspiration, not source.*
2. **Complexity creep.** Their `BashTool.checkPermissions` is 2,621 lines. Don't import that complexity — the *pattern* (declarative `isConcurrencySafe` + permission-rule DSL) is what we want, not the implementation.
3. **Build-time features.** Their `feature('XXX')` calls are Bun-bundle dead-code-elimination boundaries, not runtime gates. We'll use our own config flag system.
4. **Statsig / GrowthBook.** They use a feature-flag service. We use config.yaml. Translation table needed in `config-loader.ts`.
5. **Single-tenant assumptions.** Their "team" mailbox, CCR, KAIROS all assume a backend. Skip these; the rest is local.
6. **Validation.** Some of their "patterns" are upstream of subtle bugs. We must independently test, not trust.

---

## 6. Pointers into the Target Repo (quick-jump)

- Coordinator: `src/coordinator/coordinatorMode.ts`
- Swarm IPC: `src/utils/swarm/backends/types.ts`, `src/utils/swarm/backends/registry.ts`, `src/utils/teammateMailbox.ts`
- Tool interface: `src/Tool.ts`, `src/tools.ts`, `src/hooks/useCanUseTool.tsx`
- Query loop: `src/QueryEngine.ts`, `src/query.ts`, `src/query/config.ts`
- Streaming executor: `src/services/tools/StreamingToolExecutor.ts`, `src/services/tools/toolOrchestration.ts`
- Memory: `src/memdir/memdir.ts`, `src/memdir/memoryTypes.ts`, `src/memdir/findRelevantMemories.ts`, `src/memdir/paths.ts`
- AutoDream: `src/services/autoDream/`
- SideQuery: `src/utils/sideQuery.ts`
- Skills: `src/skills/loadSkillsDir.ts`, `src/skills/bundled/`, `src/skills/mcpSkillBuilders.ts`
- Hooks: `src/schemas/hooks.ts`, `src/utils/hooks.ts`
- Bridge: `src/bridge/bridgeApi.ts`, `src/bridge/replBridge.ts`, `src/bridge/types.ts`
- Ink renderer: `src/ink/reconciler.ts`, `src/ink/renderer.ts`
- Vim: `src/vim/types.ts`, `src/vim/motions.ts`, `src/vim/operators.ts`, `src/vim/textObjects.ts`
- Voice: `src/services/voice.ts`, `src/services/voiceStreamSTT.ts`, `src/services/voiceKeyterms.ts`
- Migrations: `src/migrations/`
- Output styles: `src/outputStyles/loadOutputStylesDir.ts`
- Native modules: `src/native-ts/yoga-layout/`, `src/native-ts/file-index/`, `src/native-ts/color-diff/`
- State: `src/state/store.ts`, `src/state/AppState.tsx`
- Tasks: `src/Task.ts`, `src/tasks/`
- Buddy: `src/buddy/companion.ts`, `src/buddy/sprites.ts`
- Undercover: `src/utils/undercover.ts`
- ULTRAPLAN: `src/commands/ultraplan.tsx`, `src/utils/ultraplan/ccrSession.ts`
- KAIROS: search `feature('KAIROS')`
- Keybindings DSL: `src/keybindings/`
