# Chimera Port Plan — Phased

> Derived from [`claude-code-deep-dive.md`](./claude-code-deep-dive.md). Each phase is independently shippable.
> Effort scale: **XS** = < 1 day · **S** = 1-2 days · **M** = 3-5 days · **L** = 1-2 weeks · **XL** = > 2 weeks.

---

## Phase 0 — Quick Wins (XS-S, 1-2 weeks total)

These are isolated fixes that have outsized impact on user trust and code health. No architectural change.

| # | Task | Files | Effort | Verification |
|---|---|---|---|---|
| 0.1 | Wire `AuditLog` into `SessionOrchestrator` — `logToolCall` after each tool, `logLLMCall` after each LLM call, `logSecurityEvent` on `checkUserInput`/`checkToolOutput` blocks | `chimera-core/src/session-orchestrator.ts:246, 812`, `security/audit-log.ts:30` | XS | Run `chimera`; tail `.chimera/audit.log`; verify entries present |
| 0.2 | Remove `MockProvider` silent fallback; hard-error when no provider configured | `chimera-providers/src/provider-factory.ts:113-116`, `chimera-cli/src/cli-router.ts:85-87` | XS | Run with no env vars; verify hard error, not silent echo |
| 0.3 | Implement `SessionOrchestrator.exportState` (currently empty stub at `session-orchestrator.ts:183-208`) | `session-orchestrator.ts:183-208`, `chimera-cli/src/cli-router.ts:512` | S | Restart session; verify checkpoint file has real content |
| 0.4 | Add CLI subcommands for `SessionStore` (list/show/delete/export/import) and `SessionMigrator` | `chimera-cli/src/cli-router.ts:1-558`, `chimera-session/src/session-store.ts`, `session-export.ts`, `session-migrator.ts` | S | `pnpm chimera sessions list` returns saved sessions; `export` writes JSON |
| 0.5 | Add `chimera eval` CLI subcommand wrapping `EvalHarness`; use a cheap-model (Haiku-class) LLM judge via a new `sideQuery` channel | `chimera-cli/src/cli-router.ts`, `chimera-eval/src/eval-harness.ts:98, 224`, new `chimera-core/src/side-query.ts` (XS) | S | `pnpm chimera eval ./fixtures/test-task.json` returns scored report |
| 0.6 | Remove or implement `OAL`/`OTB` modes (currently undefined in code) | `chimera-core/src/types/agent.ts:3`, `chimera-cli/src/cli-router.ts:105`, `tui/components/mode-selector.tsx:28` | XS | Decide: ship a 1-line description in README, or remove the union member |
| 0.7 | Drop unused `pino` from `chimera-cli/package.json:33` OR wire it for structured logging | `chimera-cli/package.json:33` | XS | `pnpm install`; `chimera --help` works |
| 0.8 | Remove or replace the "Exa AI" lie in `webSearchTool` (`tools/web.ts:110`); integrate a real free-tier search (DuckDuckGo HTML, or require a `TAVILY_API_KEY` env) | `chimera-tools/src/tools/web.ts:110-121` | S | `chimera "search the web for X"` returns real results |
| 0.9 | Replace LSP stub with their symbol extraction pattern from `src/utils/` OR with a TypeScript-native symbol indexer (e.g. via `ts-morph` we already have via `typescript` devDep) | `chimera-tools/src/tools/lsp.ts:22, 57-182`, new `chimera-tools/src/tools/lsp-symbol-index.ts` | M | `chimera "what calls SessionOrchestrator.execute?"` returns real symbols |

**Phase 0 exit criteria:** all 9 quick wins land; `pnpm build && pnpm test && pnpm typecheck && pnpm lint` all green; README's "What Works" section updates accordingly.

---

## Phase 1 — Context Engine & Memory (S-M, 2-3 weeks)

The marquee chimera differentiator. Three sub-systems to wire and one to add.

### 1A. Wire `ContextEngine` into `SessionOrchestrator`
**Source pattern:** `src/utils/api.ts:1-200` in target repo — prompt assembly with `cache_control`, `defer_loading`, `eager_input_streaming`, instructions hierarchy (system/user/mode/nearby/prefs/memory).
**Files:** `chimera-context/src/context-engine.ts:1-465` (already implemented), `chimera-core/src/session-orchestrator.ts:267` (replace `LongTermMemory.retrieve` with `buildContextPack`).
**Effort:** M.
**Verification:** Use a long-context task; verify the assembled prompt includes repo map, instructions hierarchy, and tool list; verify token count tracking.

### 1B. Implement multi-tier compaction (the "relay racing")
**Source pattern:** `src/query.ts:360-510` in target repo — `HISTORY_SNIP` → `CACHED_MICROCOMPACT` → `REACTIVE_COMPACT` → `CONTEXT_COLLAPSE` → `autoCompact`. Each step gated by a config flag.
**Files:** new `chimera-context/src/compaction/{history-snip,microcompact,reactive-compact,context-collapse,auto-compact}.ts`; delete or repurpose the dead `relay-racing.ts:33-221` (keep its threshold constants).
**Effort:** M.
**Verification:** Drive a long session, fill context, verify the compaction pipeline runs in the correct order; verify handoff events emit.

### 1C. Add `sideQuery` LLM side-channel
**Source pattern:** `src/utils/sideQuery.ts:1-100` in target repo — cheap-Haiku-class LLM calls for memory recall, classification, intent detection.
**Files:** new `chimera-core/src/side-query.ts` (~100 LOC); add `small` provider slot to `ModelRegistry` (`chimera-providers/src/model-registry.ts:1-478` already has a `small` tier).
**Effort:** S.
**Verification:** Replace `TaskRouter.classifyTask` (currently a 15-keyword heuristic at `task-router.ts:1-118`) with a `sideQuery` call; verify same accuracy, lower cost on average.

### 1D. Add `autoDream` (memory consolidation)
**Source pattern:** `src/services/autoDream/` in target repo.
**Files:** new `chimera-core/src/memory/auto-dream.ts`; gate in config.yaml with `memory.auto_dream.enabled` + `min_hours` + `min_sessions`.
**Effort:** M.
**Verification:** Run a session, check that a background consolidation job fires when `time-since-last > min_hours && session_count > min_sessions && lockfile free`.

### 1E. Wire `WorktreeIsolation` into `CoordinatorEngine`
**Source pattern:** their per-subagent worktree usage in `AgentTool` schema.
**Files:** `chimera-core/src/agent/worktree-isolation.ts:31-68`, `coordinator/coordinator-engine.ts`.
**Effort:** S.
**Verification:** `chimera parallel "do X in worktrees/a, Y in worktrees/b, merge"`; verify two worktrees get created and cleaned up.

**Phase 1 exit criteria:** `chimera ask` on a 200K-token repo completes with a single user-visible handoff event emitted mid-stream; `LongTermMemory` has at least one `project`-scoped entry persisted; `autoDream` runs in background after session close.

---

## Phase 2 — Tool System Upgrade & Concurrency-Safe Fanout (M, 2 weeks)

### 2A. Upgrade `Tool<P,R>` interface
**Source pattern:** `src/Tool.ts:1-792` — 30-method interface with `buildTool()` safe defaults + type-level `BuiltTool<D>` spread.
**Files:** `chimera-tools/src/tool-schema.ts:1-99` (extend), `tool-builder.ts:1-40` (expand defaults).
**Effort:** M.
**Verification:** Every existing tool still passes `pnpm typecheck`; defaults make previously-required fields optional at the call site.

### 2B. Add `StreamingToolExecutor` for parallel tool dispatch
**Source pattern:** `src/services/tools/StreamingToolExecutor.ts:1-200` in target repo.
**Files:** new `chimera-tools/src/streaming-executor.ts`; integrate into `ToolExecutor` (`tool-executor.ts:1-85`).
**Effort:** M.
**Verification:** `chimera "read all *.ts in src/ and report sizes"` — verify reads happen in parallel, not serially.

### 2C. Wire `RateLimiter` and `FallbackChain`
**Source pattern:** their `provider-factory` wraps every call with a rate-limiter check + fallback chain on retryable errors.
**Files:** `chimera-providers/src/provider-factory.ts:1-237`, new `chimera-providers/src/wrap-with-limiter.ts`.
**Effort:** S.
**Verification:** Run 100 rapid completions across two providers; verify rate limiter throttles; force one provider to 503 and verify fallback to second.

### 2D. Wire `BudgetEnforcer` into the orchestrator (pre-call gate)
**Source pattern:** their `cost-tracker` integrates with the prompt-assembly step to refuse completion if budget is hit.
**Files:** `chimera-core/src/session-orchestrator.ts:307, 329, 371, 419` (add pre-call check); `chimera-providers/src/budget-enforcer.ts:28-148`.
**Effort:** S.
**Verification:** Set `cost_caps.per_task: 0.01`; verify orchestrator refuses to call LLM at the cap and returns a budget-exceeded message.

**Phase 2 exit criteria:** Tools fanout in parallel; rate limiter active; budget enforced pre-call; fallback chain verified on simulated 503.

---

## Phase 3 — Extensions: Hooks, Skills, Output Styles, Migrations (M, 2 weeks)

These are the "ecosystem" features that make chimera extensible from the outside.

### 3A. Hooks subsystem
**Source pattern:** `src/schemas/hooks.ts:1-200` + `src/utils/hooks.ts:1-150` in target repo.
**Files:** new `chimera-tools/src/hooks/{schema,executor,index}.ts`; integrate at `ToolExecutor.execute` boundary; events: `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart/End`, `SubagentStart/Stop`, `UserPromptSubmit`, plus configurable custom events.
**Effort:** M.
**Verification:** Drop a hook into `.chimera/hooks/pre-tool-use.sh` that logs all bash calls; verify it fires.

### 3B. Skills as first-class Commands
**Source pattern:** `src/skills/loadSkillsDir.ts:1-150` + bundled skills in `src/skills/bundled/`.
**Files:** new `chimera-core/src/skills/{loader,registry,index}.ts`; refactor `chimera-tools/src/tools/skill.ts:1-38` (currently loads `.kilo/skills/<name>.md`) to load from `.chimera/skills/<name>/SKILL.md` with frontmatter (`description`, `tools`, `model`, `whenToUse`, `allowedTools`, `userInvocable`, `context`).
**Effort:** M.
**Verification:** Drop a skill into `.chimera/skills/review-pr/SKILL.md`; verify `/review-pr` becomes a slash command.

### 3C. Output styles
**Source pattern:** `src/outputStyles/loadOutputStylesDir.ts:1-100` — markdown files in `.claude/output-styles/` and `~/.chimera/output-styles/`, frontmatter `name`/`description`/`keep-coding-instructions`.
**Files:** new `chimera-core/src/output-styles.ts`; surface in `chimera-cli` via `--style <name>`.
**Effort:** S.
**Verification:** Add a verbose style; run `chimera ask --style verbose "explain X"`; verify the output uses the style.

### 3D. Idempotent migrations
**Source pattern:** `src/migrations/` folder of source-scoped functions.
**Files:** new `chimera-session/src/migrations/` (move existing `session-migrator.ts` logic into per-source functions); run at startup from `cli-router.ts`.
**Effort:** S.
**Verification:** Save a v1 session, bump config version, restart; verify migration runs once and is idempotent on second restart.

**Phase 3 exit criteria:** External users can extend chimera via hooks, skills, output styles, and migrations without forking.

---

## Phase 4 — Multi-Provider Parallel Fanout (M-L, 2-3 weeks)

The orchestrator's biggest claim ("multiple agents work in parallel") is the most underdelivered.

### 4A. Real provider fanout
**Source pattern:** their `assignProviders` would have a per-subagent provider pool; in chimera, replace the no-op at `coordinator-engine.ts:99`.
**Files:** `coordinator-engine.ts:99`, new `chimera-core/src/coordinator/provider-pool.ts`.
**Effort:** M.
**Verification:** Configure 2 frontier + 1 cheap + 1 challenger in config.yaml; run `chimera parallel "do 3 sub-tasks"`; verify each sub-task uses a different provider, and the cheap provider is used for classification.

### 4B. Replace `agent-mesh.ts:39-72` stub with real `executeQualityGate`
**Source pattern:** `src/coordinator/coordinatorMode.ts:1-369` (system-prompt-based) + their streaming tool executor.
**Files:** `chimera-core/src/agent-mesh.ts:39-72`, `session-orchestrator.ts:312-447`.
**Effort:** M.
**Verification:** Run a quality-gated task; verify the `draft_proposed`/`verified`/`challenged` events correspond to actual LLM calls, not synthetic emits.

### 4C. Coordinator prompt + role switch
**Source pattern:** `src/coordinator/coordinatorMode.ts:1-369`.
**Files:** new `chimera-core/src/prompts/coordinator.ts`; add `coordinator_mode` config flag.
**Effort:** S.
**Verification:** `chimera --coordinator ask "complex task"` uses the coordinator prompt; verify the model follows the delegation rules.

**Phase 4 exit criteria:** Real multi-agent execution at the user-visible level; `parallel` subcommand uses distinct providers; quality gate is real.

---

## Phase 5 — Defer / Evaluate

Items to revisit in a future cycle. Listed with the trigger condition that would move them into a phase.

| Item | Trigger |
|---|---|
| Vim mode | When chimera-tui grows a non-trivial input experience beyond REPL. |
| Voice | When there's a user request or a strategic decision to enter the voice space. |
| Bridge / Remote Control | Out of scope unless we build a hosted offering. |
| KAIROS / ULTRAPLAN | Cloud-only; revisit if we build backend services. |
| Buddy | Skip unless product wants gamification. |
| Undercover | Skip — no internal-codename concern. |
| Yoga native binding work | Skip — Ink handles. |
| In-process file-index | Adopt only if LSP upgrade (Phase 0.9) doesn't suffice. |

---

## Suggested Sequencing

| Week | Phase | Outcome |
|---|---|---|
| 1-2 | Phase 0 (9 quick wins) | Audit log, no-silent-fallback, eval CLI, real web search, real LSP. |
| 3-5 | Phase 1 (Context + Memory) | `ContextEngine` wired, multi-tier compaction, `sideQuery`, `autoDream`, worktrees. |
| 6-7 | Phase 2 (Tool Upgrade) | Richer `Tool` interface, `StreamingToolExecutor`, rate limiter, fallback chain, budget gate. |
| 8-9 | Phase 3 (Extensions) | Hooks, first-class skills, output styles, migrations. |
| 10-12 | Phase 4 (Real Multi-Agent) | Provider fanout, real quality gate, coordinator prompt. |

Total: ~12 weeks for all four phases. Each phase is independently shippable behind a flag if we want faster incremental releases.

---

## Open Questions for the User

Before starting, I need a few decisions:

1. **Licensing posture.** Are we OK mining *patterns* (re-implement, no verbatim code) from the leaked source, given its provenance? Or do we want to limit ourselves to the *public* Claude Code docs / OSS Ink-style libraries only?
2. **Phase ordering.** The plan sequences Quick Wins → Context/Memory → Tool Upgrade → Extensions → Multi-Agent. Do you want a different order (e.g., multi-agent first)?
3. **`OAL`/`OTB` modes.** Implement or remove?
4. **`MockProvider` fallback.** Hard error (recommended) or keep silent fallback with stronger warning?
5. **Tests.** Do we want one test per ported subsystem, or are existing `__tests__/` patterns enough?
