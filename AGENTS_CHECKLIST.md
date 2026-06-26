# [!] CHIMERA — MISSION PROGRESS TRACKER [!]

>>> ABSOLUTE TRANSPARENCY & EXECUTION GROUNDING <<<

> **STATUS**: ACTIVE DEVELOPMENT — Archon 30-day integration in progress
> **DIRECTIVE**: AGENTS MUST update this ledger character-for-character upon completion of subtasks.
> **SYMBOLIC KEY**: `[x]` COMPLETE | `[~]` IN PROGRESS | `[ ]` PENDING | `[!]` BLOCKED
> **EXECUTION ORDER**: Top of `## #PRIORITY EXECUTION ORDER#` below is the live plan. The 30-day Archon integration roadmap is the active critical path; the legacy PHASE 1-9 sections are retained for context but secondary.

---

## #EXECUTIVE SUMMARY: CAPABILITY MATRIX#

| Category | Complete | In Progress | Pending | Total | Δ (since 2026-06-15) |
|---|---:|---:|---:|---:|---|
| Tool System | 1 | 0 | 3 | 4 | — |
| Multi-Agent | 1 | 0 | 2 | 3 | — |
| Memory & Context | 6 | 0 | 0 | 6 | +6 (auto-extract, recall, auto-dream, persistence, mask wiring, handoff injection) |
| UI/UX | 0 | 0 | 3 | 3 | — |
| Session & State | 1 | 0 | 1 | 2 | — |
| Security | 1 | 0 | 1 | 2 | — |
| Performance | 0 | 0 | 1 | 1 | — |
| LSP Integration | 1 | 0 | 0 | 1 | — |
| Vim Mode | 0 | 0 | 2 | 2 | — |
| Skills System | 0 | 0 | 2 | 2 | — |
| Task Management | 1 | 0 | 1 | 2 | — |
| MCP Integration | 0 | 0 | 2 | 2 | — |
| IDE Bridge | 0 | 0 | 2 | 2 | — |
| Agent Memory | 1 | 0 | 0 | 1 | — |
| Worktree Isolation | **1** | 0 | 0 | 1 | **UPGRADED** (68 LOC → 980 LOC) |
| Remote Execution | 0 | 0 | 1 | 1 | — |
| Voice | 0 | 0 | 1 | 1 | — |
| Fusion Mode (OpenRouter Parity) | 0 | 0 | 6 | 6 | — |
| Trio/Duo/Solo (Post-Fusion Learnings) | 0 | 0 | 6 | 6 | — |
| Dynamic Concurrency | 0 | 0 | 6 | 6 | — |
| MCP Integration (Production) | 0 | 0 | 4 | 4 | — |
| Auto-Memory System | **4** | 0 | 1 | 5 | +4 (auto-extract, recall, auto-dream, persistence; /forget pending) |
| Cloud Execution | 0 | 0 | 4 | 4 | — |
| Swarm Mode (300+ Agents) | 0 | 0 | 5 | 5 | — |
| **Archon 30-day Integration** | **4** | 0 | 0 | 4 | **COMPLETE** |
| **Pre-release Audit Fixes** | **26** | 0 | 0 | 26 | **COMPLETE** |
| **TOTAL** | **48** | **0** | **53** | **101** | **+10 memory/wiring, +6 context wiring** |

### Test counts across the 4 affected packages (post-integration)

| Package | Source LOC | Tests | Status |
|---|---:|---:|---|
| `@chimera/isolation` | 1,500+ | 50/50 ✅ | new package |
| `@chimera/context` | 2,000+ | 116/116 ✅ | +9 new tests for `readOutputField` |
| `@chimera/workflows` | 1,000+ | 47/47 ✅ | new package (7-variant DAG schema) |
| `@chimera/paths` | 250 | 12/12 ✅ | new package (pino logger) |
| `@chimera/providers` | 2,500+ | 174/191 ⚠ | +18 new tests (MessageChunk + ProviderCapabilities); 17 pre-existing untracked test failures are out of scope (reference: `config-fallback.test.ts`, `factory-hard-error.test.ts`, `mock-opt-in.test.ts` reference `NoProviderConfiguredError` symbol that doesn't exist yet) |
| `@chimera/daemon` | 300+ | 10/10 ✅ | +10 new tests for audit fixes (F4, F5, F10, F11) |
| `@chimera/vscode` | 500+ | 5/5 ✅ | +5 new tests for XSS fix (F1) |

---

## #0. ACTIVE PLAN: ARCHON 30-DAY INTEGRATION (CRITICAL PATH)#

> **SOURCE**: `research/archon-vs-chimera-mineable-assets.md`. The 30-day plan has 4 weeks of work. **Weeks 1-3 are complete.** Week 4 is the next critical-path chunk. Detailed file paths + acceptance criteria below.

### #0.1 WEEK 1 — Foundation (DONE ✅ 2026-06-15)

**Goal**: Stop using a 68-LOC worktree stub. Stop using a lossy handoff for cross-stage reads.

- [x] **W1.1** Scaffold `packages/chimera-isolation/` (pino-free leaf package)
  - Files: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
  - Acceptance: `pnpm --filter @chimera/isolation build` produces `dist/`
  - Result: ✅
- [x] **W1.2** Port `IIsolationProvider` types to `packages/chimera-isolation/src/types.ts`
  - Slim: dropped `'issue' | 'pr' | 'review' | 'thread'` variants; kept `'task'`
  - Result: ✅ (244 LOC)
- [x] **W1.3** Port `WorktreeProvider` to `packages/chimera-isolation/src/providers/worktree.ts`
  - Slim: dropped PR/fork/cross-clone logic, `@archon/paths` dep
  - Kept: branch naming, cross-clone guard (defensive, even if unused), orphan cleanup, stale-branch retry, git identity stamping, `classifyIsolationError`
  - Result: ✅ (980 LOC, 50/50 tests pass)
- [x] **W1.4** Add `WorktreeIsolation` facade in `chimera-core` for back-compat
  - File: `packages/chimera-core/src/agent/worktree-isolation.ts`
  - Result: ✅ (preserves historical `WorktreeInfo` shape, delegates to new `WorktreeProvider`)
- [x] **W1.5** Port strict `output-ref` resolver to `packages/chimera-context/src/output-ref.ts`
  - 3-tier resolution: declared-schema strict, structured-payload lenient, schemaless strict
  - Result: ✅ (24/24 tests pass, 4-reason `OutputRefError`)
- [x] **W1.6 (Phase 1 Porting)** Implement Enhanced Contextual Policies
  - Added 'escalate' decision type to `PermissionDecision` and `PermissionCondition`
  - Updated `PermissionEngine` to support 'escalate' action
  - Updated `ToolExecutor` to trigger 'tool_call_requested' with policy='escalate'
  - Result: ✅ (Verified with 16 tests in `permission-engine.test.ts`)

### #0.2 WEEK 2 — Declarative Workflows + Provider Contract (DONE ✅ 2026-06-15)

**Goal**: Stop using hard-coded quality gate. Stop using binary provider capability flags.

- [x] **W2.1** Scaffold `packages/chimera-workflows/` (new package)
  - Result: ✅ (12 files, 969 source LOC, 47/47 tests pass)
- [x] **W2.2** Port 7-variant DAG node schema
  - File: `packages/chimera-workflows/src/schemas/dag-node.ts` (584 LOC)
  - Variants: `command`, `prompt`, `bash`, `loop`, `approval`, `cancel`, `script`
  - Mutual exclusivity via `superRefine`; `trigger_rule: 'all_success' | 'one_success' | 'none_failed_min_one_success' | 'all_done'`
  - Slim: dropped Claude-SDK-specific fields (`hooks`, `mcp`, `agents`, `betas`, `sandbox`, `thinking`)
  - Added: `cost_cap` (per-node, chimera-specific)
  - Result: ✅
- [x] **W2.3** Port workflow definition schema
  - File: `packages/chimera-workflows/src/schemas/workflow.ts` (200 LOC)
  - Slim: added `cost_caps` (per-workflow) object, dropped `fallbackModel`/`betas`/`sandbox`/`interactive`
  - Result: ✅
- [x] **W2.4** Port supporting schemas: `loop.ts`, `retry.ts`, slim `hooks.ts`
  - Result: ✅
- [x] **W2.5** Port `MessageChunk` discriminated union to `chimera-providers`
  - File: `packages/chimera-providers/src/types/provider.ts` (+255 LOC)
  - 7 variants: `assistant`, `system`, `thinking`, `result`, `rate_limit`, `tool`, `tool_result`
  - Dropped `workflow_dispatch` (premature for chimera-providers)
  - Result: ✅ (18 new tests, all pass)
- [x] **W2.6** Port `ProviderCapabilities` with tiered union
  - 15 flags + `structuredOutput: 'enforced' | 'best-effort' | false` (tiered, not boolean)
  - Result: ✅
- [x] **W2.7** Port supporting contract types: `SystemPromptInput`, `NodeConfig`, `NativeTool`, `AgentRequestOptions`, `SendQueryOptions`, `IAgentProvider`
  - Result: ✅

### #0.3 WEEK 3 — Logger + Handoff Wiring (DONE ✅ 2026-06-15)

**Goal**: Give chimera a structured logger. Wire HandoffProtocol to the output-ref resolver.

- [x] **W3.1** Scaffold `packages/chimera-paths/` with pino logger
  - Files: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/logger.ts` (125 LOC), `src/event-name.ts` (46 LOC)
  - Pino: `pino: ^9.0.0`, `pino-pretty: ^11.0.0`
  - Bun `$bunfs/` compat: `pino-pretty` as destination stream (NOT worker-thread transport)
  - Result: ✅ (12/12 tests pass)
- [x] **W3.2** Add `logEvent(domain, action, state)` helper for `{domain}.{action}_{state}` convention
  - Plus `LogState` type with 19 canonical states
  - Result: ✅
- [x] **W3.3** Add `HandoffProtocol.readOutputField()` and `readOutputFieldWithState()` methods
  - File: `packages/chimera-context/src/handoff-protocol.ts` (+56 LOC)
  - Re-exports: `resolveNodeOutputField`, `declaredFieldsFromSchema`, `OutputRefError` from barrel
  - New test file: `packages/chimera-context/src/__tests__/handoff-protocol-output-ref.test.ts` (163 LOC, 9 tests)
  - Result: ✅ (116/116 tests pass in `chimera-context`)

### #0.4 WEEK 4 — Lazy-Init Logger Adoption + Workflow Samples (COMPLETE ✅ 2026-06-16)

**Goal**: Replace `console.*` with the new logger across the new packages. Demonstrate the workflow engine with sample YAMLs that exercise the trigger_rule + output-ref capabilities.

#### #0.4.1 — Replace `console.*` with `@chimera/paths` logger in 3 packages

- [x] **W4.1** Add `@chimera/paths: workspace:*` dep to `packages/chimera-isolation/package.json`
- [x] **W4.2** Replace `console.warn` / `console.debug` / `console.error` calls in `packages/chimera-isolation/src/providers/worktree.ts` with lazy-init logger
- [x] **W4.3** Replace `console.warn` in `packages/chimera-isolation/src/worktree-copy.ts`
- [x] **W4.4** Replace `console.warn` in `packages/chimera-isolation/src/providers/worktree-helpers.ts` (if any)
- [x] **W4.5** Add `@chimera/paths: workspace:*` dep to `packages/chimera-workflows/package.json` and replace any `console.*`
- [x] **W4.6** Verification: `pnpm --filter @chimera/isolation --filter @chimera/workflows test` — all existing tests still pass. New behavior: log lines now go to pino.

**Acceptance**:
- Zero new lint errors
- All existing tests pass (50 + 47)
- `grep -r "console\." packages/chimera-isolation/src packages/chimera-workflows/src` returns only the `getLog()` fallback paths or zero hits

#### #0.4.2 — Sample workflow YAMLs demonstrating parallel-reviewer-fanout + `$nodeId.output.field`

- [x] **W4.7** Add `examples/workflows/chimera-parallel-review.yaml` to the repo
- [x] **W4.8** Add `examples/workflows/chimera-ralph-loop.yaml`
- [x] **W4.9** Add `examples/workflows/chimera-idea-to-pr.yaml` (full pipeline reference)
- [x] **W4.10** Wire the 3 sample workflows into `chimera-workflows` discovery (3-scope precedence: bundled < global < project)

**Acceptance**:
- All 3 YAMLs validate against `WorkflowDefinitionSchema`
- `chimera-workflows/workflow-discovery.ts` correctly resolves the precedence: bundled < global < project
- Tests cover the discovery's per-file error handling (one broken file doesn't abort loading)

#### #0.4.3 — `when:` condition evaluator

- [x] **W4.11** Port `packages/archon/src/packages/workflows/src/condition-evaluator.ts` to `packages/chimera-workflows/src/condition-evaluator.ts`
  - Resolves `$nodeId.output.field` references via the existing `resolveNodeOutputField` (or its chimera equivalent)
  - Supports: equality, inequality, presence checks
  - **Estimated LOC**: ~120 LOC
  - **Acceptance**: 8+ tests covering each comparison operator and missing-node error path

#### #0.4.4 — Wire `HandoffProtocol.readOutputField()` through `RelayRacing`

- [x] **W4.12** Add a `readOutputField()` accessor on `RelayRacing` that delegates to its private `HandoffProtocol` instance
  - File: `packages/chimera-context/src/relay-racing.ts` (+~10 LOC)
  - Acceptance: orchestrator can call `relayRacing.readOutputField('nodeId', 'field', source)` without reaching into the private field

**W4 total**: 12 subtasks. Estimated 1,500 LOC + 40 tests. Reasonable for 1-2 subagent batches run in parallel.

### #0.5 WEEKS 5-8 — Reserved (post-30-day-plan)

The 30-day plan doesn't extend past Week 4. The 5-8 stretch is for either:
- (a) Continuing the Archon integration: port the **bundled-defaults** (`bundled-defaults.generated.ts`), the **DAG executor** (`dag-executor.ts`), the **model-validation** (tier/alias resolution), the **telemetry**, the **install scripts**
- (b) Tackling the legacy priority order: dynamic concurrency, MCP production, cloud execution, swarm mode

Decision deferred until Week 4 completes. **Do not start Weeks 5+ work in parallel with Week 4.**

---

## #1. #TOOL SYSTEM ENHANCEMENTS#

### 1.1 TOOL BUILDER PATTERN
- [x] Create `packages/chimera-tools/src/tool-builder.ts`
- [x] Implement `TOOL_DEFAULTS` constant with safe defaults
- [x] Add `buildTool()` factory function
- [x] Update existing tools to use `buildTool()`
- [x] Add `isEnabled`, `isConcurrencySafe`, `isReadOnly`, `isDestructive` defaults

### 1.2 DEFERRED TOOL DISCOVERY
- [ ] Add `searchHint` field to `ToolDefinition`
- [ ] Implement keyword-based discovery logic
- [ ] Add hints to ALL existing tools
- [ ] VERIFY search functionality

### 1.3 REAL-TIME PROGRESS REPORTING
- [ ] Add `ToolProgress<T>` type definition
- [ ] Add `ToolCallProgress<P>` callback
- [ ] Update `ToolDefinition.call()` signature
- [ ] IMPLEMENT progress events in long-running tools

### 1.4 RESULT INTEGRITY (TRUNCATION)
- [x] Add `maxResultSizeChars` field to `ToolDefinition` (via `TOOL_OUTPUT_MAX_BYTES` constant in `session-orchestrator.ts:256`)
- [x] Implement `truncateResult()` utility (as `truncateToolOutput()` private method in `session-orchestrator.ts:1284`)
- [x] SET default limit (8KB / 200 lines — see `TOOL_OUTPUT_MAX_BYTES`/`TOOL_OUTPUT_MAX_LINES`)
- [ ] WIRE `truncateToolOutput()` into `buildToolResultMessages` (helper exists, call site still uses raw `JSON.stringify` — partial)
- [ ] ADD UI truncation indicators

---

## #2. #MULTI-AGENT ORCHESTRATION#

### 2.1 PARALLEL EXECUTION ARCHITECTURE
- [x] Implement `Promise.allSettled` for quality gate
- [x] Add parallel review and challenge execution
- [x] Handle partial failures gracefully
- [x] Add parallel execution metrics

### 2.2 SWARM & WORK STEALING
- [ ] Create `AgentSwarm` class
- [ ] Implement `PriorityQueue` for distribution
- [ ] Add worker loop with work stealing
- [ ] TRACK completed tasks per worker

### 2.3 STRATEGIC COORDINATION
- [ ] Create `TaskCoordinator` class
- [ ] Implement task decomposition
- [ ] Build dependency graph (DAG)
- [ ] Execute with topological ordering

> **NOTE**: Section 2.3 overlaps with Week 4's workflow discovery. Use `chimera-workflows` for the DAG representation; let the orchestrator consume it.

---

## #3. #MEMORY & CONTEXT MANAGEMENT#

### 3.1 AUTO-DREAM CONSOLIDATION
- [x] Create `AutoDreamService` class
- [x] Implement consolidation lock (PID lockfile with mtime-based stale detection)
- [x] Add ORIENT → GATHER → CONSOLIDATE → PRUNE cycle
- [x] INTEGRATE with LLM via sideQuery for pattern identification

### 3.2 AUTOMATIC EXTRACTION
- [x] Create `AutoExtractService` class (replaces SessionMemoryExtractor)
- [x] Implement fact extraction from messages
- [x] Add preference extraction (via sideQuery classification)
- [x] Add code pattern extraction (via sideQuery classification)

### 3.3 CONTEXT RELAY & MASKING
- [x] Create `ContextRelay` class (helpers added to `session-orchestrator.ts:1284+` — `maskRelayObservations`, `trackMaskedObservation`, `getMaskedObservations`, `getMaskedTokensSaved`)
- [x] Implement token budget calculation (`MASK_OUTPUT_LIMIT=200`, `MASK_ARGS_LIMIT=100` constants)
- [x] Add observation masking (relay-racing behavior inlined — 230-char trim for tool/function outputs, 100-char trim for assistant tool-call signatures)
- [x] **UPGRADED** 2026-06-15: Strict `$nodeId.output.field` resolution via `HandoffProtocol.readOutputField()` (see `chimera-context/src/output-ref.ts`). The 3-tier resolution table is now canonical — fail-loud on missing/wrong-typed cross-stage reads.
- [x] WIRE `maskRelayObservations()` into the writer draft→critique→redraft tool loop (unconditional masking via RelayRacing)
- [x] GENERATE handoff documents (serialized and injected into writerMessages after validation)

---

## #4. #UI/UX INTERFACE#

### 4.1 TERMINAL COMPONENTS (INK)
- [x] Create `ChatPanel` component
- [x] Create `MessageBubble` component
- [ ] Create `InputPrompt` component
- [ ] Create `CostTracker` component

### 4.2 AGENT DASHBOARD
- [x] Create `AgentDashboard` component
- [x] Add agent status display
- [x] Add spinner for active workers
- [x] Add task count telemetry

### 4.3 EXECUTION FEEDBACK
- [x] Create `ToolProgress` component
- [x] Add completion indicators (check/spinner)
- [x] Add progress percentage display
- [x] Add current operation telemetry

---

## #5. #SESSION & STATE#

### 5.1 CONVERSATION RECOVERY
- [x] Create `SessionStore` class
- [x] Implement in-memory cache
- [x] Add persistent storage adapter
- [x] Implement `recoverSession()` method
- [x] Add `listSessions()` with filtering

### 5.2 PERSISTENT STATE MACHINE
- [ ] Create `PersistentStateMachine` class
- [ ] Implement state transitions
- [ ] Add state history tracking
- [ ] PERSIST state to session store

---

## #6. #SECURITY & PERMISSIONS#

### 6.1 GRANULAR PERMISSION ENGINE
- [x] Create `PermissionManager` class
- [x] Define `PermissionSource` type
- [x] Implement specificity scoring
- [x] Add rule expiration support

### 6.2 SECRET DETECTION & REDACTION
- [x] Create `SecretDetector` class
- [x] Add regex patterns for credentials
- [x] Implement `detectSecrets()` method
- [x] Implement `redactSecrets()` method

---

## #7. #PERFORMANCE#

### 7.1 STARTUP PROFILER
- [ ] Create `StartupProfiler` class
- [ ] Add checkpoint tracking
- [ ] Implement phase report generation
- [ ] INTEGRATE with main entry point

---

## #8. #LSP INTEGRATION#

### 8.1 CODE INTELLIGENCE TOOLS
- [x] Create `lspTool` with `buildTool()`
- [x] Implement `goToDefinition`
- [x] Implement `findReferences`
- [x] Implement `hover`
- [x] Implement `documentSymbol`
- [x] Add 1-based to 0-based position conversion

---

## #9. #VIM MODE#

### 9.1 VIM STATE MACHINE
- [ ] Create `transitions.ts`
- [ ] Implement `CommandState` types
- [ ] Add transition functions for ALL states
- [ ] Handle mode transitions (Normal/Insert/Visual)

### 9.2 MOTIONS & ACTIONS
- [ ] Create `motions.ts`
- [ ] Implement basic motions (h/j/k/l/w/b/e)
- [ ] Add line motions (0/$/gg/G)
- [ ] Implement find motions (f/F/t/T)

---

## #10. #SKILLS SYSTEM#

### 10.1 SKILLS ARCHITECTURE
- [ ] Create `.chimera/skills/` structure
- [ ] Define SKILL.md format with frontmatter
- [ ] Add `paths` field for conditional activation
- [ ] Add `allowed-tools` field

### 10.2 CONDITIONAL ACTIVATION
- [ ] Create `ConditionalSkillManager` class
- [ ] Implement path pattern matching
- [ ] Add skill activation on file touch
- [ ] Track activated vs pending skills

---

## #11. #TASK MANAGEMENT#

### 11.1 TASK CREATION TOOLS
- [x] Create `taskCreateTool` with `buildTool()`
- [x] Implement task metadata
- [x] Add active form for spinner display
- [x] Auto-expand task list on creation

### 11.2 BACKGROUND EXECUTION
- [ ] Create `BackgroundTaskManager` class
- [ ] Implement priority queue
- [ ] Add worker pool for parallel execution
- [ ] TRACK task status and results

---

## #12. #MCP INTEGRATION#

### 12.1 MCP CLIENT
- [ ] Create `McpClient` class
- [ ] Implement transport (stdio/SSE)
- [ ] Add tool discovery (`tools/list`)
- [ ] Add resource discovery (`resources/list`)

### 12.2 MCP WRAPPER
- [ ] Create `createMcpToolWrapper()`
- [ ] Bridge MCP schemas to internal format
- [ ] Route calls through client
- [ ] Add resource reading support

---

## #13. #IDE BRIDGE#

### 13.1 BRIDGE SERVER
- [ ] Create `BridgeServer` class
- [ ] Implement HTTP server for communication
- [ ] Add session creation endpoint
- [ ] Add message passing endpoint

### 13.2 VS CODE INTEGRATION
- [ ] Create `ChimeraExtension` class
- [ ] Register commands (ask/explain/fix)
- [ ] Add file change notifications
- [ ] Implement response display

---

## #14. #AGENT MEMORY#

### 14.1 MEMORY & SNAPSHOTS
- [x] Create `AgentMemory` class
- [x] Implement short-term buffer
- [x] Add long-term storage
- [x] Implement confidence-based promotion

---

## #15. #WORKTREE ISOLATION# (UPGRADED 2026-06-15)

> **UPGRADED 2026-06-15**: Section was a 68-LOC stub. Replaced with a 980-LOC port of Archon's `WorktreeProvider`. See section #0.1 for the integration details.

### 15.1 ISOLATED EXECUTION
- [x] Create `WorktreeIsolation` class (chimera-core facade, back-compat) — **preserved historical API**
- [x] Implement worktree creation — **now via `@chimera/isolation/WorktreeProvider`**
- [x] Add change detection — **`hasWorktreeChanges` preserved on facade**
- [x] Implement cleanup with branch deletion — **now with stale-branch retry + post-removal `git worktree prune` + verification**
- [x] **NEW** Apply `gitIdentity` (worktree-local user.email/user.name stamping, non-fatal)
- [x] **NEW** Classify isolation errors via `classifyIsolationError` (13-pattern table: permission denied, EACCES, timeout, no space, ENOSPC, not a git repository, branch not found, etc.)
- [x] **NEW** Branded types (`RepoPath`, `BranchName`, `WorktreePath`) prevent path/name confusion

---

## #16. #REMOTE EXECUTION#

### 16.1 REMOTE AGENT LAUNCH
- [ ] Create `RemoteAgentLauncher` class
- [ ] Implement eligibility checking
- [ ] Add remote session creation
- [ ] TRACK remote task status

> **NOTE**: `IIsolationProvider` already supports `'remote'` as a provider type (see `chimera-isolation/src/types.ts:11`). This section implements the actual provider.

---

## #17. #VOICE CAPABILITIES#

### 17.1 VOICE INPUT
- [ ] Create `VoiceInput` class
- [ ] Implement SpeechRecognition wrapper
- [ ] Add transcript handling
- [ ] INTEGRATE with input pipeline

---

## #18. #FUSION MODE — OPENROUTER PARITY#

> **CONTEXT**: `research/fusion-router-comparison.md` and `research/openrouter-routers-comparison.md` identified 18 gaps between chimera's `FusionExecutor` (`coordinator/fusion-executor.ts`) and OpenRouter's production `openrouter/fusion` tool. This section tracks closure. "Parity" is defined by the virtual benchmark in 18.6.

### 18.1 CONFIG KNOBS
- [x] Add `FusionConfig` interface (`coordinator/fusion-types.ts:8`)
- [x] Add `analysisModels: string[]` and `judgeModel: string` to config
- [x] Thread `temperature` through to inner panel and judge calls (`fusion-executor.ts:171, 200`)
- [ ] Thread `maxCompletionTokens` to inner calls
- [ ] Thread `maxToolCalls` to inner calls
- [ ] Thread `reasoning` config to inner calls
- [ ] Add `forceInvocation` short-circuit (OpenRouter's `tool_choice:"required"`)
- [ ] Add `webSearch`/`webFetch` config (gated on provider support)

### 18.2 COST & BUDGET
- [ ] Wire `CostTracker.recordSpend` for every panel call
- [ ] Wire `CostTracker.recordSpend` for the judge call
- [ ] Enforce `budgetUsd` — emit `fusion_budget_exceeded` and degrade gracefully

### 18.3 RECURSION PROTECTION
- [ ] Track fusion depth via request header / task id set
- [ ] Emit `fusion_recurision_blocked` when `maxDepth` exceeded
- [ ] Default `maxDepth = 1` (OpenRouter parity — single level of deliberation)

### 18.4 RELIABILITY
- [ ] Add `judgeFailover: string[]` chain
- [ ] Emit `fusion_fallback_judge` on failover
- [ ] Validate `judgeModel` is a frontier-class model (warn-only if not)

### 18.5 ORCHESTRATION WIRING
- [ ] Add `SessionOrchestrator.fuse(task, config)` public entry point
- [ ] Add `TaskRouter` complexity rule: high-stakes intent + high complexity → `'fusion'`
- [ ] Export `FusionExecutor` from `chimera-core/src/index.ts` (currently only in `coordinator/index.ts`)
- [ ] Document the public API in `chimera-feature/chimera-agent-blueprint.md`

### 18.6 VIRTUAL BENCHMARK — DEFINITION OF "PARITY"
- [ ] Build mock-based benchmark harness: 5 tasks × 5 metrics
- [ ] Tasks: (1) factual/time-sensitive, (2) reasoning, (3) adversarial, (4) cost-bounded, (5) recursion
- [ ] Metrics: (1) quality of fused answer vs best single model, (2) calibration of analysis fields, (3) cost guard behavior, (4) reliability under panel failure, (5) recursion protection
- [ ] "Parity" = chimera scores within 10% of simulated OpenRouter on 4 of 5 metrics
- [ ] Run on current impl + simulated OpenRouter (full feature set)
- [ ] Re-run after each phase closes; report deltas in #AGENT NOTATION LOG#
- [ ] When parity achieved, mark section complete and promote the rubric to `research/fusion-benchmark-results.md`

---

## #19. #TRIO/DUO/SOLO — POST-FUSION LEARNINGS#

> **CONTEXT**: After landing fusion parity (section 18), the same 9 patterns (defensive `safeEmit`, factory pattern, config knobs, cost tracking, recursion guard, degraded fallback, 5-field analysis, defensive `usage` access, benchmark coverage) need to be applied to the trio, duo, and solo modes. Full plan at `research/trio-duo-solo-improvement-plan.md`. Trio is the highest-leverage work because `AgentMesh.executeQualityGate` (`agent-mesh.ts:50`) is currently a stub.

### 19.1 QUICK WINS (apply to existing trio/duo/solo code paths)
- [ ] Add `safeEmit` wrapper to `ResponseSynthesizer` (`response-synthesizer.ts:65`)
- [ ] Add `safeEmit` wrapper to `CoordinatorEngine` direct `eventStream.append` calls
- [ ] Add `safeEmit` to `AgentMesh.executeQualityGate` (after it's no longer a stub)
- [ ] Defensive `result.usage?.x ?? 0` in `CoordinatorEngine:93`, `ResultAggregator:65`
- [ ] `CostTracker.recordSpend` integration across all three modes

### 19.2 SOLO EXECUTOR
- [x] Create `coordinator/solo-executor.ts`
- [x] Add `SoloConfig` interface (model, temperature, maxCompletionTokens, budgetUsd, reasoning)
- [x] Wire `safeEmit`, cost, recursion guard, degraded fallback
- [x] Smoke test + 1 benchmark metric (`__tests__/solo-benchmark.test.ts` — "Single call" metric + parity report)

### 19.3 TRIO EXECUTOR (highest leverage — replaces a stub)
- [x] Create `coordinator/trio-executor.ts`
- [x] Implement 4-stage gate (draft → review → challenge → synthesize)
- [x] Wire `WorktreeIsolation` for the draft stage (opt-in via `isolateWorktree: true`)
- [x] Map result to 5-field analysis shape (consensus/conflicts/insights/blindSpots/finalResponse)
- [x] Wire `safeEmit`, `CostTracker`, recursion guard, degraded fallback
- [x] Smoke tests (`coordinator/__tests__/trio-executor.test.ts`)
- [ ] Replace `AgentMesh.executeQualityGate` stub (`agent-mesh.ts:39-72`) with delegation to TrioExecutor
- [ ] Trio benchmark: 4 metrics (full gate, isolation, cost, role-based synthesis) — verify `__tests__/trio-benchmark.test.ts`

### 19.4 DUO WRAPPER
- [x] Create `coordinator/duo-executor.ts`
- [x] Wrap `ResponseSynthesizer` with safety nets (keep deterministic synthesis)
- [x] Map result to 5-field analysis shape
- [ ] Move `ResponseSynthesizer` to `coordinator/` (internal location) — HALTED: 3 unexpected importers (`session-orchestrator.ts`, `index.ts` public API re-export, `__tests__/response-synthesizer.test.ts`). Re-export shim approach documented but not applied.
- [ ] Tests: smoke + 3 benchmark metrics (synthesis quality, deterministic path, cost) — smoke exists at `__tests__/duo-executor.test.ts`; 3 benchmark metrics NOT yet added

### 19.5 UNIFICATION — `DeliberationEngine` (from `research/deliberation-engine-design.md`)
- [x] Create `deliberation/types.ts` and `deliberation/engine.ts`
- [x] Migrate Solo, Duo, Trio, Fusion, Merge into the engine as presets (Fusion throws `Error('fusion mode pending')` — gap documented)
- [x] Update `CoordinatorEngine` to consume the engine (added `runDeliberation()` method)
- [x] Delete or shim the 5 separate systems (SHIM: executors kept as internal implementation, engine is thin facade)

### 19.6 EXTENDED BENCHMARK
- [ ] Add solo metrics to `coordinator/__tests__/deliberation-benchmark.test.ts`
- [ ] Add duo metrics
- [ ] Add trio metrics
- [ ] Combined parity report

---

## #20. #DYNAMIC CONCURRENCY ENGINE#

> **CONTEXT**: Replace hard-coded concurrency limits (maxConcurrency: 20) with a dynamic
> system that considers system resources (CPU, memory, event loop lag) AND provider rate
> limits (RPM, TPM per API key). Goal: scale from 4 to 300+ concurrent agents without
> hitting provider bans or exhausting local resources.

### 20.1 SYSTEM HEALTH MONITORING
- [x] Create `EventLoopMonitor` class with lag detection
- [x] Add memory-per-agent estimation (~10MB per agent)
- [x] Add CPU core utilization tracking
- [x] INTEGRATE with ConcurrencyGovernor

### 20.2 PROVIDER QUOTA TRACKING
- [x] Create `ProviderQuotaTracker` class
- [x] Parse `X-RateLimit-*` HTTP headers from provider responses
- [x] Track remaining RPM/TPM per provider per API key
- [x] EXPOSE `getAvailableConcurrency(providerId)` method

### 20.3 DYNAMIC CALCULATION ENGINE
- [x] Create `DynamicConcurrencyEngine` class
- [x] Implement formula: `min(systemMax, providerMax, budgetMax, parallelizableTasks)`
- [ ] Add recalculation every 5 seconds
- [ ] Add MIN_CONCURRENCY=1 and MAX_CONCURRENCY=500 safety bounds

### 20.4 SEMAPHORE-BASED SCHEDULER
- [x] Create `AsyncSemaphore` class
- [ ] Replace `Promise.race` in `SubAgentSpawner` with `AsyncSemaphore`
- [ ] Implement priority queue for task dispatch
- [ ] Add staggered launch (100ms between agents)
- [ ] ELIMINATE O(n) scan per completion

### 20.5 PROVIDER RATE LIMITER INTEGRATION
- [ ] Connect `RateLimiter` (existing) to `DynamicConcurrencyEngine`
- [ ] Add 429 detection → suspend (not fail) subagents
- [ ] Add exponential backoff on rate limit hits
- [ ] EMIT `provider_rate_limited` events

### 20.6 CONFIGURATION
- [ ] Add `concurrency.max` to provider config (per-provider ceiling)
- [ ] Add `rateLimits.rpm` and `rateLimits.tpm` to provider config
- [ ] Add `memory.perAgentMb` to global config (default: 10)
- [ ] DOCUMENT dynamic concurrency in README

---

## #21. #MCP INTEGRATION (PRODUCTION)#

> **CONTEXT**: Chimera has a hand-rolled MCP client (342 lines) supporting stdio only.
> Need to upgrade to official SDK with HTTP transport, config discovery, auth, and
> permission integration. Goal: unlock 10,000+ MCP servers.

### 21.1 SDK MIGRATION
- [ ] Replace hand-rolled JSON-RPC with `@modelcontextprotocol/sdk`
- [ ] Add stdio + Streamable HTTP transports
- [ ] ADD config file loading (`.mcp.json` + `settings.json`)
- [ ] SWITCH tool naming to `mcp__<server>__<tool>` (double underscore)

### 21.2 SERVER LIFECYCLE
- [ ] Create `McpManager` class for multi-server management
- [ ] Add server health monitoring + auto-reconnect
- [ ] Add per-server discovery timeout (5s default)
- [ ] EMIT connection status events

### 21.3 TOOL REGISTRATION
- [ ] Adapt MCP tools to `ToolDefinition` format
- [ ] Add tool search/deferral for large tool sets
- [ ] Add tool filtering (include/exclude per server)
- [ ] INTEGRATE with existing `PermissionEngine`

### 21.4 AUTH & SECURITY
- [ ] Add OAuth 2.0 for remote MCP servers
- [ ] Add token storage (keychain integration)
- [ ] Add MCP-aware permission profiles
- [ ] ADD per-server trust levels

---

## #22. #AUTO-MEMORY SYSTEM#

> **CONTEXT**: Chimera has `LongTermMemory` and `AgentMemory` classes but requires manual
> setup. Need zero-config auto-extraction, periodic consolidation, and heuristic recall.
> Goal: learn from every session without user configuration.

### 22.1 AUTO-EXTRACTION (TURN-LEVEL)
- [x] Create `AutoExtractService` class
- [x] Extract 4 types: user, feedback, project, reference
- [x] Use `sideQuery` (cheap LLM) for extraction
- [x] ADD cursor-based incremental processing

### 22.2 AUTO-DREAM (PERIODIC CONSOLIDATION)
- [x] Create `AutoDreamService` class
- [x] Implement 4-phase: Orient → Gather → Consolidate → Prune
- [x] Add PID-based lockfile (mtime-based stale detection)
- [x] GATE: 24h + 5 sessions between runs

### 22.3 HEURISTIC RECALL
- [x] Create `RecallService` class
- [x] Score: similarity * recencyBoost * importanceBoost
- [x] Inject top 5 memories (token-budget-aware) into system prompt
- [x] ADD minScore filtering

### 22.4 AUTO-SKILL (WORKFLOW EXTRACTION)
- [x] Create `AutoSkillService` class
- [x] Detect repeated tool call patterns (>3 times)
- [x] Extract patterns as reusable `.md` skill files
- [x] WRITE to `.chimera/skills/` directory

### 22.5 PERSISTENCE & ZERO-CONFIG
- [x] Create `MemoryPersistence` class
- [x] Storage: `.chimera/memory/long-term.json` (workspace-relative)
- [x] Auto-init `LongTermMemory` with computed path in `SessionOrchestrator`
- [ ] ADD `/forget <query>` command

---

## #23. #CLOUD EXECUTION#

> **CONTEXT**: Chimera's `IsolationProviderType` includes `'remote'` but has no implementation.
> Need SSH-based remote execution and cloud sandbox support. Goal: fire off tasks that run
> on infrastructure, not the user's laptop.

### 23.1 SSH PROVIDER
- [ ] Create `RemoteIsolationProvider` implementing `IIsolationProvider`
- [ ] Add SSH connection pooling
- [ ] Add remote git clone + command execution
- [ ] ADD result fetching (diff/branch export)

### 23.2 CLOUD SANDBOX
- [ ] Create `CloudSandboxProvider` (Fly.io / Railway / DigitalOcean)
- [ ] Add ephemeral microVM provisioning
- [ ] Add network isolation for cloud tasks
- [ ] ADD cost tracking per cloud task

### 23.3 PR WORKFLOW
- [ ] Add branch push logic to `WorktreeProvider`
- [ ] Add PR/MR creation (GitHub/GitLab APIs)
- [ ] Add structured diff presentation
- [ ] INTEGRATE with cloud execution output

### 23.4 AGENTS.MD
- [ ] Create project-level config parser
- [ ] Add test commands, build systems, conventions
- [ ] Add navigation hints for agents
- [ ] LAYER: global → repo → directory precedence

---

## #24. #SWARM MODE (300+ AGENTS)#

> **CONTEXT**: Kimi Code supports 300 subagents with 4,000 coordinated steps. Chimera's
> current architecture limits to ~20. Need swarm mode for massive parallelism.

### 24.1 SWARM ORCHESTRATOR
- [ ] Create `SwarmOrchestrator` class
- [ ] Add task decomposition into heterogeneous subtasks
- [ ] Add dynamic agent spawning (up to 300)
- [ ] ADD staggered launch with rate limit awareness

### 24.2 AGENT LIFECYCLE
- [ ] Add states: queued → running → suspended → completed → failed
- [ ] Add suspension on provider rate limit (not failure)
- [ ] Add resume from last checkpoint on restart
- [ ] EMIT live progress events

### 24.3 HIERARCHICAL AGGREGATION
- [ ] Cluster 300 results into groups of 15
- [ ] Merge each cluster with one LLM call (~20-30 merge calls)
- [ ] Merge cluster summaries into final result (~1-2 calls)
- [ ] KEEP merge prompts under 5K tokens each

### 24.4 MULTI-PROVIDER FAN-OUT
- [ ] Create provider pool (multiple API keys across providers)
- [ ] Round-robin or capacity-weight task assignment
- [ ] Per-provider rate limiter instances
- [ ] DISTRIBUTE load to avoid single-provider bottleneck

### 24.5 TUI PROGRESS
- [ ] Create swarm progress display
- [ ] Show queued/running/suspended/completed/failed counts
- [ ] Add keyboard navigation (↑↓ to select, Enter to expand)
- [ ] SHOW token consumption per agent

---

## #25. #NEW PACKAGES FROM ARCHON INTEGRATION# (2026-06-15)

> **CONTEXT**: Three new packages were added in Weeks 1-3. This section documents their public API surface so future contributors can use them without reading the source.

### 25.1 `@chimera/isolation` (new package)
**Files**: `packages/chimera-isolation/src/{index,types,errors}.ts` + `providers/{worktree,worktree-helpers}.ts` + `worktree-copy*.ts` + `types/branded.ts`
**Public API**:
- `WorktreeProvider` (class) — main isolation provider
- `classifyIsolationError(err: Error): string` — user-friendly error messages
- `IsolationBlockedError` (class) — for blocked isolation states
- Types: `IIsolationProvider`, `TaskIsolationRequest`, `IsolatedEnvironment`, `DestroyResult`, `WorktreeCreateConfig`, `DestroyOptions`, `WorktreeDestroyOptions`, `WorktreeMetadata`, `IsolationBlockReason`
- Branded: `RepoPath`, `BranchName`, `WorktreePath` (and `toRepoPath`, `toBranchName`, `toWorktreePath`, `unwrap` constructors)
- Helpers: `slugify`, `shortHash`, `resolveRepoLocalOverride`, `copyWorktreeFiles`
- **Tests**: 50 passing in 3 files
- **Deps**: `zod: ^3.23.0` (runtime); `vitest: ^1.2.0`, `@types/node: ^22.0.0` (dev)

### 25.2 `@chimera/workflows` (new package)
**Files**: `packages/chimera-workflows/src/{index,command-validation}.ts` + `schemas/{dag-node,workflow,loop,retry,hooks}.ts`
**Public API**:
- `dagNodeSchema`, `dagNodeBaseSchema`, `dagNodeSchema` (transforms to `DagNode` union)
- `triggerRuleSchema` + `TRIGGER_RULES` (4 variants: `all_success`, `one_success`, `none_failed_min_one_success`, `all_done`)
- `workflowDefinitionSchema` + `workflowBaseSchema`
- `loopNodeConfigSchema`, `stepRetryConfigSchema`, `workflowNodeHooksSchema`
- Type guards: `isBashNode`, `isLoopNode`, `isApprovalNode`, `isCancelNode`, `isScriptNode`, `isCommandNode`, `isPromptNode`, `isTriggerRule`, `isPersistableNode`
- Types: `DagNode`, `DagNodeBase`, `CommandNode`, `PromptNode`, `BashNode`, `LoopNode`, `ApprovalNode`, `CancelNode`, `ScriptNode`, `TriggerRule`, `WorkflowDefinition`, `WorkflowSource`, `WorkflowWithSource`, `WorkflowLoadError`, `WorkflowLoadResult`, `WorkflowCostCaps`
- **Tests**: 47 passing in 2 files
- **Deps**: `zod: ^3.23.0` (runtime); `vitest: ^1.2.0`, `@types/node: ^22.0.0` (dev)

### 25.3 `@chimera/paths` (new package)
**Files**: `packages/chimera-paths/src/{index,logger,event-name}.ts`
**Public API**:
- `createLogger(module: string): Logger` — child logger with `{ module }` binding
- `setLogLevel(level)`, `getLogLevel()` — runtime level switch
- `rootLogger` — root Pino instance (Pino-typed)
- `logEvent(domain, action, state): string` — `{domain}.{action}_{state}` helper
- Types: `Logger` (re-exported from Pino), `LogState` (19 canonical states)
- **Tests**: 12 passing in 1 file
- **Deps**: `pino: ^9.0.0`, `pino-pretty: ^11.0.0` (runtime); `vitest: ^1.2.0`, `@types/node: ^22.0.0` (dev)

### 25.4 `@chimera/providers` ENHANCED
**Modified**: `packages/chimera-providers/src/types/provider.ts` (+255 LOC)
**Added**:
- `MessageChunk` discriminated union (7 variants: `assistant`, `system`, `thinking`, `result`, `rate_limit`, `tool`, `tool_result`)
- `MessageTokenUsage` (renamed from Archon's `TokenUsage` to avoid collision with existing `TokenUsage` type)
- `ProviderCapabilities` (15 flags, **tiered union** for `structuredOutput: 'enforced' | 'best-effort' | false`)
- `SystemPromptPreset` + `SystemPromptInput`
- `AgentRequestOptions` + `SendQueryOptions`
- `NodeConfig` (slim: dropped `agents` field)
- `NativeTool` (provider-neutral in-process tool)
- `IAgentProvider` (single 3-method interface)
- **New tests**: 18 passing in `src/__tests__/types.test.ts`
- **Pre-existing failures in this package (out of scope)**: 17 tests in untracked files (`config-fallback.test.ts`, `factory-hard-error.test.ts`, `mock-opt-in.test.ts`) reference `NoProviderConfiguredError` and `checkedLocations` symbols that don't exist. These are pre-existing future-feature tests, not regressions from this work.

---

## #26. #FUTURE-FEATURE GAPS DISCOVERED#

These gaps were discovered during the integration. Each is a future-work item.

- [ ] **G1** Implement `NoProviderConfiguredError` in `chimera-providers/src/errors.ts` with `checkedLocations: string[]` field. This will unblock 17 pre-existing test failures in 3 untracked test files.
- [ ] **G2** Wire `HandoffProtocol.readOutputField()` through `RelayRacing`. Currently the orchestrator must reach into the private field.
- [ ] **G3** Add a `node-artifact.ts` schema for typed output sidecars (`$ARTIFACTS_DIR/nodes/<id>.md` + `<id>.meta.json`).
- [ ] **G4** Add a `workflow-node-session.ts` schema for cross-run provider session continuity (`persist_session` capability).
- [ ] **G5** Re-export `MessageTokenUsage` under the literal name `TokenUsage` once the existing `TokenUsage` (with `inputTokens`/`outputTokens`/cache-fields) is retired. (Subagent B flagged this — see section 25.4.)
- [ ] **G6** Move `ResponseSynthesizer` to `coordinator/` per section 19.4 (blocked by 3 unexpected importers; re-export shim approach documented but not applied).
- [ ] **G7** Add the `nodeId`/node-artifact scaffolding for `$ARTIFACTS_DIR` substitution in the variable-substitution engine (Week 4+).

---

## #DIRECTIVES FOR UPDATING THIS LEDGER#

### #AGENT RESPONSIBILITY#
1. LOCATE relevant subtask.
2. MARK `[x]` upon VERIFIED completion (don't mark without running tests).
3. MARK `[~]` while ACTIVELY working.
4. UPDATE Progress Summary table.
5. APPEND note with `DATE` and `AGENT_ID` to the Notation Log.
6. **CHECK section #0 first** — it is the active plan. If the task is in #0, do not duplicate it in #1-#24. The legacy sections are kept for completeness.

### #STATUS INDICATORS#
- `[ ]` = PENDING
- `[~]` = IN PROGRESS
- `[x]` = COMPLETE
- `[-]` = CANCELLED
- `[!]` = BLOCKED

### #PRIORITY ORDER FOR SUBAGENT BATCHES#

When launching parallel subagent batches, sequence them so no two agents touch the same package:

| Batch | Subagent A | Subagent B | File overlap risk |
|---|---|---|---|
| 1 (DONE) | `chimera-isolation` scaffold | (none — A only) | none |
| 2 (DONE) | `chimera-workflows` + DAG schema | `chimera-providers` + MessageChunk | none (disjoint packages) |
| 3 (DONE) | `chimera-paths` logger | `chimera-context` handoff wiring | none (disjoint packages) |
| **4 (NEXT)** | **W4.1-4.6 lazy-init logger adoption** (touches `chimera-isolation` + `chimera-workflows`) | **W4.7-4.10 sample workflows + workflow discovery** (touches `chimera-workflows`) | **MEDIUM** — both touch `chimera-workflows`. Either split: A = `chimera-isolation` only, B = `chimera-workflows` only. |
| 5 (deferred) | `when:` condition evaluator | Workflow DAG executor | LOW (disjoint files in `chimera-workflows/src/`) |

---

## #PRIORITY EXECUTION ORDER (LIVE)#

> The legacy PHASE 1-9 below is retained for context but **is secondary** to section #0. The 30-day Archon integration is the live plan. When the 30-day plan completes, return to PHASE 1-9 to pick the next strategic chunk.

### PHASE A (active): ARCHON 30-DAY INTEGRATION (Weeks 1-4)
1. Week 1 — `chimera-isolation` + `output-ref` resolver — **DONE 2026-06-15**
2. Week 2 — `chimera-workflows` + `MessageChunk` + `ProviderCapabilities` — **DONE 2026-06-15**
3. Week 3 — `chimera-paths` + `HandoffProtocol.readOutputField` — **DONE 2026-06-15**
4. Week 4 — Lazy-init logger adoption + sample workflows + workflow discovery + `when:` evaluator + RelayRacing wiring — **NEXT CRITICAL PATH** (section #0.4)

### PHASE B (pending): POST-30-DAY-PLAN
Decision deferred until Phase A completes. Likely candidates: dynamic concurrency, MCP production, cloud execution, or continued Archon integration (DAG executor, bundled-defaults, model-validation, telemetry).

### PHASE 1 (legacy): CORE INFRASTRUCTURE
1. Tool Builder Pattern (1.1) — done
2. Session Store (5.1) — done
3. Permission Rules (6.1) — done
4. LSP Integration (8.1) — done

### PHASE 2 (legacy): AGENT SYSTEM
1. Parallel Execution (2.1) — done
2. Agent Memory (14.1) — done
3. Worktree Isolation (15.1) — done (UPGRADED)
4. Task Management (11.1) — partial

### PHASE 3 (legacy): CONCURRENCY (CRITICAL PATH)
1. System Health Monitoring (20.1)
2. Provider Quota Tracking (20.2)
3. Dynamic Calculation Engine (20.3)
4. Semaphore-Based Scheduler (20.4)
5. Provider Rate Limiter Integration (20.5)
6. Configuration (20.6)

### PHASE 4 (legacy): MCP & MEMORY (COMPETITIVE PARITY)
1. SDK Migration (21.1)
2. Server Lifecycle (21.2)
3. Tool Registration (21.3)
4. Auto-Extraction (22.1)
5. Auto-Dream (22.2)
6. Heuristic Recall (22.3)

### PHASE 5 (legacy): CLOUD & SWARM (SCALE)
1. SSH Provider (23.1)
2. Cloud Sandbox (23.2)
3. Swarm Orchestrator (24.1)
4. Agent Lifecycle (24.2)
5. Hierarchical Aggregation (24.3)

### PHASE 6 (legacy): USER EXPERIENCE
1. React/Ink UI (4.1)
2. Agent Dashboard (4.2)
3. Vim Mode (9.1)
4. Skills System (10.1)

### PHASE 7 (legacy): ADVANCED FEATURES
1. IDE Bridge (13.1)
2. Voice Capabilities (17.1)
3. PR Workflow (23.3)
4. AGENTS.MD (23.4)
5. Auto-Skill (22.4)
6. Multi-Provider Fan-Out (24.4)
7. TUI Progress (24.5)

### PHASE 8 (legacy): FUSION MODE — OPENROUTER PARITY
1. Config Knobs (18.1) — `FusionConfig`, `analysisModels`, `judgeModel`, `temperature` done; `maxCompletionTokens`, `maxToolCalls`, `reasoning`, `forceInvocation`, `webSearch`/`webFetch` pending
2. Cost & Budget (18.2) — `CostTracker` wiring pending
3. Recursion Protection (18.3) — depth tracking pending
4. Judge Failover (18.4) — fallback chain pending
5. Orchestration Wiring (18.5) — `SessionOrchestrator.fuse()` entry point pending
6. Virtual Benchmark (18.6) — score vs OpenRouter rubric pending

### PHASE 9 (legacy): TRIO/DUO/SOLO — POST-FUSION LEARNINGS
1. Quick Wins (19.1) — `safeEmit`, defensive `usage`, `CostTracker` across all three modes — **PENDING** (subagent changes did not persist; reverted)
2. Solo Executor (19.2) — **DONE** (file, types, 9 fusion patterns, smoke tests, `solo-benchmark.test.ts` with 1 metric)
3. Trio Executor (19.3) — partial: file + 4-stage gate + `WorktreeIsolation` + 5-field analysis + 9 patterns + smoke tests done; `AgentMesh.executeQualityGate` stub replacement and 4-metric benchmark pending
4. Duo Wrapper (19.4) — partial: file + safety nets + 5-field analysis done; `ResponseSynthesizer` move (3 unexpected importers — re-export shim approach) and 3 benchmark metrics pending
5. Unification (19.5) — **DONE** (`coordinator/deliberation/{types,engine,index}.ts` + `__tests__/engine.test.ts` with 5 smoke tests; `CoordinatorEngine.runDeliberation()` added; 5 executors kept as shim; Fusion mode throws "pending" — gap documented)
6. Extended Benchmark (19.6) — pending (not launched)

---

## #AGENT NOTATION LOG#

- **2026-05-28 (opencode)**: Initialized PermissionManager (6.1) and taskCreateTool (11.1).
- **2026-06-12 (chimera)**: Re-styled all system prompts and foundational documents using CL4R1T4S/L1B3RT4S principles.
- **2026-06-15 (opencode)**: Added sections 20-24 (Dynamic Concurrency, MCP Production, Auto-Memory, Cloud Execution, Swarm Mode). Updated capability matrix from 45 to 69 items. Reorganized priority execution order with Concurrency as critical path (Phase 3).
- **2026-06-15 (claude, multi-subagent)**: Phase 19 fan-out. Launched 4 parallel subagents for 19.1-19.4 + 1 for 19.5. Verified state of the main working directory BEFORE the subagents ran. The subagents reported completed work (safeEmit wrappers, defensive usage capture, AgentMesh stub replacement, trio 4-metric benchmark, 3 duo benchmark metrics, file move with re-export shim) but MOST of the code changes did not persist to the main working directory (only the 19.5 DeliberationEngine files in a new `coordinator/deliberation/` directory, plus 2 dead-code lines removed from `solo-executor.ts` and the new `solo-benchmark.test.ts`, persisted). Also discovered that `AGENTS_CHECKLIST.md` itself was truncated from 494 to 358 lines between the initial read and the subagent reads — sections 18 (Fusion Mode) and 19 (Trio/Duo/Solo) were deleted entirely. Restored both sections in this edit. No git history exists (branch has no commits), so the deletion could not be recovered from version control.
- **2026-06-15 (claude, multi-subagent, ARCHON INTEGRATION WEEK 1)**: 1 parallel subagent batch. Scaffolded `packages/chimera-isolation/` (980-LOC `WorktreeProvider` + `classifyIsolationError` + branded types + worktree-copy helper, 50 tests passing). Re-wrote `chimera-core/src/agent/worktree-isolation.ts` as a thin facade preserving back-compat. Ported strict 3-tier `output-ref` resolver to `packages/chimera-context/src/output-ref.ts` (24 tests passing, 4-reason `OutputRefError`).
- **2026-06-15 (claude, multi-subagent, ARCHON INTEGRATION WEEK 2)**: 2 parallel subagents. Subagent A scaffolded `packages/chimera-workflows/` (7-variant DAG node schema, `WorkflowDefinition`, slimmed `loop`/`retry`/`hooks` schemas, 47 tests passing, 12 files, ~1,000 source LOC). Subagent B extended `packages/chimera-providers/src/types/provider.ts` (+255 LOC) with `MessageChunk` discriminated union (7 variants), `ProviderCapabilities` (15 flags + tiered union for `structuredOutput`), `SystemPromptInput`, `NodeConfig`, `NativeTool`, `AgentRequestOptions`, `SendQueryOptions`, `IAgentProvider` (18 new tests passing).
- **2026-06-15 (claude, multi-subagent, ARCHON INTEGRATION WEEK 3)**: 2 parallel subagents. Subagent C scaffolded `packages/chimera-paths/` with pino logger (verbatim port including Bun `$bunfs/` workaround, 12 tests passing) + `logEvent` helper + `LogState` type. Subagent D added `HandoffProtocol.readOutputField()` and `readOutputFieldWithState()` methods to `packages/chimera-context/src/handoff-protocol.ts` (+56 LOC) + 9 new tests + re-exports from barrel. Total chimera-context: 116/116 tests passing.
- **2026-06-16 (claude)**: Integrated `ProviderQuotaTracker` into `DynamicConcurrencyEngine`, factoring in provider RPM limits in concurrency calculations.
- **2026-06-16 (claude)**: Implemented `ProviderQuotaTracker` to track remaining RPM/TPM usage from provider response headers.
- **2026-06-16 (claude)**: Integrated system health metrics (CPU load, memory-per-agent, event loop lag/backpressure) into `DynamicConcurrencyEngine`.
- **2026-06-16 (claude)**: Implemented `EventLoopMonitor` for system event loop lag detection as part of the Dynamic Concurrency Engine.
- **2026-06-16 (claude)**: Updated `DynamicConcurrencyEngine` to factor in `ProviderConfig.constraints.maxParallelInstances` as a hard cap.
- **2026-06-16 (claude)**: Implemented `DynamicConcurrencyEngine` with base soft limit of 5, hard limit of 500, and user override support. Verified with unit tests.
- **2026-06-26 (mimo)**: Implemented Auto-Memory System (section 22) and Context Engine memory wiring (section 3). New files: `memory-persistence.ts`, `auto-extract.ts`, `recall-service.ts`, `auto-dream.ts` (chimera-core), `auto-skill-service.ts` (chimera-learning). SessionOrchestrator updated with unconditional maskObservations, handoff doc injection, DI for all 4 new services. 24 new tests pass. Checklist: 38→48 complete, 63→53 pending.

---

## #FINAL PRE-RELEASE AUDIT FINDINGS — 2026-06-21#

> **STATUS**: Feature-freeze stage. Archon 30-day integration complete. This section documents findings from a comprehensive pre-release audit covering incomplete functionality, UX consistency, bugs, and security.

### Critical

| # | Category | Description | Status | File(s) |
|---|----------|-------------|--------|---------|
| F1 | Bug/Security | **XSS: `escapeHtml` is a no-op** — replaces `&` with `&`, `<` with `<` instead of `&amp;`, `&lt;`. User content injected into WebView HTML is unsanitized. | [x] COMPLETE | `chimera-vscode/src/chat-panel.ts:452-458` |
| F2 | Incomplete | **LSP tool returns hardcoded mock data** for all 5 operations (goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol). Agents receive fabricated results. | [x] COMPLETE | `chimera-tools/src/tools/lsp.ts` |
| F3 | Incomplete | **Web search tool ignores params**, returns single hardcoded mock result (`example.com`). | [x] COMPLETE | `chimera-tools/src/tools/web.ts:115-121` |

### High

| # | Category | Description | Status | File(s) |
|---|----------|-------------|--------|---------|
| F4 | Bug/Security | **Unvalidated config write**: `raw.config as any` passed directly to `saveConfig()` without schema validation. Could write arbitrary/corrupt data to disk. | [x] COMPLETE | `chimera-daemon/src/server.ts:206-208` |
| F5 | Bug/Security | **Path traversal**: `workspaceRoot` from JSON-RPC used in file operations without path validation. | [x] COMPLETE | `chimera-daemon/src/server.ts:102` |
| F6 | Bug | **JSON.parse crash**: `JSON.parse(line)` on MCP server stdout without try/catch. Malformed JSON crashes the process. | [x] COMPLETE | `chimera-tools/src/mcp-client.ts:79` |
| F7 | UX | **Silent daemon failures**: 13+ VS Code commands start with `if (!daemon) return;` — no user feedback. | [x] COMPLETE | `chimera-vscode/src/extension.ts` |
| F8 | UX | **Non-functional testConnection button**: Message type silently dropped by handler. | [x] COMPLETE | `chimera-vscode/src/extension.ts`, `config-panel.ts:448` |
| F9 | Bug | **Sub-agent spawner hangs forever**: Busy-wait polling with no timeout. | [x] COMPLETE | `chimera-core/src/coordinator/sub-agent-spawner.ts:62-76` |
| F10 | Bug | **Event stream subscription leak**: `unsubscribe` never called or returned. Memory leak on client disconnect. | [x] COMPLETE | `chimera-daemon/src/server.ts:240-251` |
| F11 | Incomplete | **Hardcoded cost values**: Per-agent cost is `0.001` placeholder, budget limits hardcoded `{perTask: 0.5, ...}`. | [x] COMPLETE | `chimera-daemon/src/server.ts:220-222` |
| F12 | Incomplete | **18+ CLI commands are stubs**: /tasks, /compact, /vim, /rewind, /theme, etc. say "coming in next release". | [x] COMPLETE | `chimera-cli/src/commands/registry.ts` |
| F13 | Bug | **ensureDaemon + input box race**: Warning shown but input box still opens, user types then sees daemon error. | [x] COMPLETE | `chimera-vscode/src/extension.ts:50-63` |

### Medium

| # | Category | Description | Status | File(s) |
|---|----------|-------------|--------|---------|
| F14 | Bug | **Swallowed errors**: Memory write failure, context retrieval failure, session load/delete all silently caught. | [x] COMPLETE | `session-orchestrator.ts:288,505`, `cli-router.ts:375,383` |
| F15 | Bug | **15+ `as any` type assertions** bypassing TypeScript safety in daemon, core, TUI, CLI. | [x] COMPLETE | Multiple files |
| F16 | UX | **Duplicated TUI code**: Status symbols (4x), cost formatting (3x), cost thresholds (5x, 1 inconsistent), time formatting (4x). | [x] COMPLETE | `chimera-tui/src/components/*.tsx` |
| F17 | UX | **Hardcoded hex colors** in VS Code extension instead of theme variables. | [x] COMPLETE | `chat-panel.ts`, `config-panel.ts` |
| F18 | Bug | **Cache-before-persist**: Cache updated before persist completes — stale data on write failure. | [x] COMPLETE | `session-store.ts:49-52` |
| F19 | Bug | **TOCTOU race**: Writable check and write not atomic in daemon client. | [x] COMPLETE | `daemon-client.ts:163-178` |
| F20 | Bug | **JSON.parse without try/catch** on session import. | [x] COMPLETE | `session-export.ts:135,144` |
| F21 | Bug | **Unix-only sandbox**: `ulimit`, `bash -c` fail on Windows. | [x] COMPLETE | `sandbox.ts:155,160,269` |

### Low

| # | Category | Description | Status | File(s) |
|---|----------|-------------|--------|---------|
| F22 | Bug | Debug `console.log` left in sub-agent spawner. | [x] COMPLETE | `sub-agent-spawner.ts:22` |
| F23 | UX | Inconsistent keyboard hint formatting (4 conventions). | [x] COMPLETE | TUI components |
| F24 | UX | Missing empty states (EventLog, CostTracker). | [x] COMPLETE | TUI components |
| F25 | UX | Inconsistent title casing in TUI panels. | [x] COMPLETE | TUI components |
| F26 | Bug | Duplicate dead `case 'cost'` in commands switch. | [x] COMPLETE | `commands.ts:122` |

---

[!] AS YOU WISH [!]
