# Phase 1 Design — Context Engine & Memory

> Companion to `port-plan.md` Phase 1. Concrete architecture, interfaces, and file map for the 5 sub-deliverables.

**Source references** (all in `/tmp/yasasbanuka-claude-code/` → Windows path `C:\Users\pc\AppData\Local\Temp\yasasbanuka-claude-code\`):
- Compaction pipeline: `src/query.ts:360-510` (snip → microcompact → contextCollapse → autocompact)
- `applyToolResultBudget` per-message cap: `src/query.ts:369-394`
- Snip module: `src/services/compact/apiMicrocompact.ts` (history snip)
- Microcompact: `src/services/compact/microCompact.ts`
- Autocompact: `src/services/compact/autoCompact.ts`
- Context collapse: `src/services/compact/compact.ts`
- Memdir entrypoint: `src/memdir/memdir.ts:1-507`
- Memory types taxonomy: `src/memdir/memoryTypes.ts:14-19` (4 types)
- Memory paths: `src/memdir/paths.ts:85-235`
- findRelevantMemories: `src/memdir/findRelevantMemories.ts:39-141`
- autoDream gate: `src/services/autoDream/autoDream.ts:95-100`
- SideQuery channel: `src/utils/sideQuery.ts:107-222`
- QueryGuard concurrency: `src/utils/QueryGuard.ts:29-121`

---

## 1A. Wire `ContextEngine` into `SessionOrchestrator`

**Current state** (`chimera-context/src/context-engine.ts:1-465`):
- `indexRepo()`, `findRelatedFiles*`, `computeImportCentrality`, `getInstructionsHierarchy`, `getRepoMap`, `buildContextPack` — all implemented.
- Not imported anywhere outside the package's own barrel.

**Target state**:
- `SessionOrchestrator.execute()` at `chimera-core/src/session-orchestrator.ts:267` (currently `LongTermMemory.retrieve`) calls `ContextEngine.buildContextPack({repo, mode, memoryEntries, toolset, userQuery})` to assemble the system prompt.
- The `ContextEngine` is **injected** into the orchestrator (constructor param, not module-imported) — so tests can stub it.
- The 5-layer instruction hierarchy (`getInstructionsHierarchy`) replaces the current single-block `prompts.ts` system prompt.

**New file: `chimera-core/src/system-prompt.ts`** (~80 LOC)
```ts
export interface SystemPromptInput {
  identity: string             // from prompts.ts identity block
  mode: Mode                   // 'ask' | 'plan' | 'code' | 'debug' | 'review' | 'oal' | 'otb'
  instructions: {
    system: string             // from prompts.ts mode-specific
    user: string | null       // .claude/CLAUDE.md or similar
    mode: string              // mode-specific
    nearby: string[]          // per-file mode hints
    prefs: string             // user preferences from memory
    memory: string[]          // from LongTermMemory
  }
  tools: ToolDefinition[]     // filtered by mode
  contextPack: ContextPack    // from buildContextPack
  budget: {                   // 5-layer budget (per G1)
    system: number
    instructions: number
    tools: number
    retrieval: number
    history: number
  }
}
export async function buildSystemPrompt(input: SystemPromptInput): Promise<string>
```

**Verification**:
- Add `chimera-core/src/__tests__/system-prompt.test.ts` — verify layer order, that memory entries appear in the `memory` slot, that tool list respects mode filtering.
- Drive a long-context task; verify the assembled prompt has the repo map and instructions hierarchy.

---

## 1B. Multi-tier Compaction Pipeline (the "Relay Racing")

**Five independent, composable stages** in fixed order (cheapest → most expensive):

| Stage | Source | Triggers | Cost |
|---|---|---|---|
| `applyToolResultBudget` | `query.ts:369-394` | Per-tool result > budget | Free (in-memory) |
| `snipCompact` | `query.ts:401-410` | Tool result > N chars or > N lines | Free (in-memory) |
| `microCompact` | `query.ts:413-426` | Cumulative tool-result tokens > threshold | Free (in-memory, structural rewrite) |
| `contextCollapse` | `query.ts:440-447` | Commit-log projection (read-time view) | Free (in-memory) |
| `autoCompact` | `query.ts:454-468` | Total prompt tokens > 80% of model context | $$$ (LLM call) |

**Thresholds** (in `chimera-context/src/compaction/thresholds.ts`):
- `TOOL_RESULT_MAX_LINES = 2000` (per result)
- `TOOL_RESULT_MAX_BYTES = 50_000` (per result)
- `MICROCOMPACT_TOKEN_THRESHOLD = 0.50` (50% of model context)
- `AUTOCOMPACT_TOKEN_THRESHOLD = 0.80` (80% of model context)
- `REACTIVE_COMPACT_AT = 0.95` (mid-turn on 429 mid_response_too_long)

**Compaction context** passed through stages:
```ts
export interface CompactionContext {
  messages: Message[]
  tokensFreed: number            // accumulated across stages
  boundaryMessage?: Message      // yielded to caller when snip creates one
  consecutiveFailures: number    // circuit breaker for autocompact
  cachedEditPending?: number     // for cache-editing microcompact
  querySource: 'main' | 'agent' | 'side_query' | 'fork'
}
```

**New file: `chimera-context/src/compaction/pipeline.ts`** (~120 LOC)
```ts
export interface CompactionPipelineDeps {
  snip: (msgs: Message[]) => SnipResult
  microcompact: (msgs: Message[], ctx: CompactionContext) => Promise<MicroCompactResult>
  contextCollapse: (msgs: Message[], ctx: CompactionContext) => Promise<CollapseResult>
  autocompact: (msgs: Message[], ctx: CompactionContext) => Promise<AutoCompactResult | null>
  uuid: () => string
  logger: Logger
}
export async function runCompactionPipeline(
  messages: Message[],
  ctx: CompactionContext,
  deps: CompactionPipelineDeps,
): Promise<{ messages: Message[]; emitted: Message[]; ctx: CompactionContext }>
```

**Each stage has its own file** under `compaction/`:
- `tool-result-budget.ts` (XS, free)
- `snip.ts` (S, free, structural trim)
- `microcompact.ts` (M, free, identifier shortening + 1-line replace for tool results)
- `context-collapse.ts` (M, free, commit-log projection)
- `auto-compact.ts` (M, $$$ LLM call with cache-safe params)

**Delete or repurpose `relay-racing.ts:33-221`** — keep the threshold constants (move to `compaction/thresholds.ts`).

**Verification**:
- `chimera-context/src/__tests__/compaction-pipeline.test.ts` — drive a synthetic 200K-token session, verify stages fire in order, freed-token counts sum correctly.
- Integration test: run a real LLM-backed long session, verify a `compaction_event` emits with stage name and tokens_freed.

---

## 1C. `sideQuery` LLM Side-Channel

**Built by Agent A in Phase 0** (`chimera-core/src/side-query.ts`). Phase 1 uses it everywhere we'd otherwise call a frontier model for a tiny task.

**New call sites** in Phase 1:
- `chimera-core/src/memory/agent-memory.ts:34` — replace heuristic relevance scoring with `sideQuery({prompt, schema: RelevanceScoreSchema})`.
- `chimera-core/src/task-router.ts:1-118` — replace 15-keyword complexity scoring with `sideQuery({prompt, schema: ComplexityScoreSchema})`.
- `chimera-eval/src/eval-harness.ts:224` — replace heuristic `evaluateQuality` with `sideQuery({prompt, schema: EvalScoreSchema})` (wired in Phase 0 by Agent B).
- `chimera-core/src/memory/memory-recall.ts` (NEW) — `findRelevantMemories` per target's `src/memdir/findRelevantMemories.ts:39-141`.

**New file: `chimera-core/src/memory/memory-recall.ts`** (~150 LOC)
```ts
export interface MemoryRecallDeps {
  sideQuery: SideQueryFn
  scanMemoryFiles: (dir: string, signal: AbortSignal) => Promise<MemoryHeader[]>
  logger: Logger
}
export async function findRelevantMemories(
  query: string,
  memoryDir: string,
  signal: AbortSignal,
  recentTools: readonly string[] = [],
  alreadySurfaced: ReadonlySet<string> = new Set(),
  deps: MemoryRecallDeps,
): Promise<{ path: string; mtimeMs: number }[]>
```

**Lockfile-based concurrency**: one `sideQuery` at a time per process. Use the same pattern as the target's `consolidationLock.ts` (PID-based lockfile in `os.tmpdir()`).

**Verification**:
- `chimera-core/src/__tests__/memory-recall.test.ts` — index fixture memories, call `findRelevantMemories` with a query, verify top-5 selection.
- `chimera-core/src/__tests__/side-query.test.ts` — Agent A's test covers the channel itself; add lockfile concurrency test here.

---

## 1D. `autoDream` — Memory Consolidation

**Source pattern** (`autoDream.ts:95-100`):
- Gate order: time-since-last ≥ minHours (default 24) → session count ≥ minSessions (default 5) → lockfile free.
- Runs as a **forked subagent** (doesn't share main context) when the gate opens.
- Skips when KAIROS or remote-mode is active.

**New file: `chimera-core/src/memory/auto-dream.ts`** (~200 LOC)
```ts
export interface AutoDreamConfig {
  minHours: number
  minSessions: number
  enabled: boolean
}
export interface AutoDreamDeps {
  config: AutoDreamConfig
  runForkedAgent: (prompt: string, options: ForkOptions) => Promise<ForkResult>
  readLastConsolidatedAt: () => Promise<Date | null>
  listSessionsTouchedSince: (since: Date) => Promise<string[]>
  tryAcquireLock: () => Promise<boolean>
  releaseLock: () => Promise<void>
  logger: Logger
}
export class AutoDream {
  constructor(private deps: AutoDreamDeps) {}
  async tick(): Promise<'gated' | 'ran' | 'skipped' | 'error'>
  // public for tests
  isGateOpen(): boolean
}
```

**Wiring**:
- `chimera-cli/src/cli-router.ts` calls `autoDream.tick()` on session start and every 10 minutes while idle.
- `chimera-core/src/session-orchestrator.ts` calls `autoDream.tick()` on session end.
- Gated in `config.yaml`:
  ```yaml
  memory:
    auto_dream:
      enabled: true
      min_hours: 24
      min_sessions: 5
  ```

**Verification**:
- `chimera-core/src/__tests__/auto-dream.test.ts` — verify gate order, lockfile conflict path, success path with a fake `runForkedAgent`.
- Manual: open a session, close it 5+ times in < 24h, verify no consolidation. Wait 24h+, verify consolidation fires.

---

## 1E. Wire `WorktreeIsolation` into `CoordinatorEngine`

**Source pattern**: target's `AgentTool` schema uses `isolation: 'worktree' | 'remote'` per subagent.

**New file: `chimera-core/src/coordinator/worktree-fanout.ts`** (~120 LOC)
```ts
export interface WorktreeFanoutOptions {
  baseDir: string
  subTaskIds: string[]
  branchPrefix: string         // default: 'chimera/'
  cleanupOnSuccess: boolean    // default: true
  cleanupOnError: boolean      // default: false (preserve for debug)
}
export interface WorktreeFanoutResult {
  worktreePaths: string[]      // one per subTaskId
  merged: { ok: boolean; conflicts: string[] } | null
}
export async function runInWorktrees(
  options: WorktreeFanoutOptions,
  runner: (worktreePath: string, subTaskId: string) => Promise<unknown>,
  deps: { git: GitFn; fs: FsFn; logger: Logger },
): Promise<WorktreeFanoutResult>
```

**Wiring**:
- `coordinator-engine.ts:99` (the no-op `assignProviders`) — replace with `runInWorktrees(...)` for the `parallel` subcommand when config flag `worktree.isolation: true`.
- Each subagent runs in its own worktree, gets merged back via `git merge --no-ff` on success.

**Verification**:
- `chimera-core/src/__tests__/worktree-fanout.test.ts` — fake git, run 2 sub-tasks, verify 2 worktrees created, merge succeeds.
- Manual: `chimera parallel "fix bug X in branch A, refactor Y in branch B" --worktree` — verify two worktrees get created, merged, cleaned up.

---

## Cross-cutting concerns

### Thread-safety
- All shared state (autocompact tracking, tool executor, sideQuery lockfile) goes through a single `QueryGuard` (target's `src/utils/QueryGuard.ts:29-121`). Reuse the design — 100-line state machine with `useSyncExternalStore`-compatible subscribe.

### Cost tracking
- Every `sideQuery` and `autoCompact` call writes to `CostTracker` with a `querySource` tag (`memdir_relevance`, `auto_compact`, `side_query`).
- `BudgetEnforcer` (currently dead at `chimera-providers/src/budget-enforcer.ts:28-148`) gets wired at the call site for `autoCompact` only (not sideQuery — too noisy).

### Audit
- Each compaction event writes an `AuditLog` entry with stage name, tokens before/after, model used.

---

## Sequencing within Phase 1

1. **1A** (ContextEngine wiring) — unblocks everything; should land first.
2. **1C sideQuery consumer sites** — can run in parallel with 1B.
3. **1B** (compaction pipeline) — biggest piece; needs design freeze.
4. **1D** (autoDream) — depends on 1C (uses sideQuery for consolidation prompt).
5. **1E** (worktree fanout) — independent; can run any time.

---

## Open design questions

1. **Where do we draw the line between `query.ts:340` snip and the per-tool-result budget?** The target applies both, in order, with the per-message budget first. We'll mirror that.
2. **Should `autoCompact` use the same model as the writer, or always a smaller model?** Target uses the same model (for prompt-cache reuse). We should too.
3. **Worktree cleanup on error**: keep the worktree (for debug) or auto-remove? Default `cleanupOnError: false` (preserve); user can `--force-cleanup`.
4. **Memory types**: chimera currently has only `LongTermMemory`. The 4-type taxonomy (`user`/`feedback`/`project`/`reference`) is a UX change — should we ship it as a v1 of the new system, or migrate gradually?
