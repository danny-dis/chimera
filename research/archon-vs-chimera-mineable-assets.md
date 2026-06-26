# Archon → Chimera: Mineable Assets Report

**Source:** `https://github.com/coleam00/Archon` (cloned to `research/archon/`, branch `main`, MIT-licensed)
**Target:** `chimera` (current working tree, `chimera/` package set)
**Authored:** 2026-06-15

---

## 0. TL;DR — What you can mine in one paragraph

Archon and chimera are complementary, not competing: Archon is a **declarative DAG workflow engine** (YAML → plan → parallel nodes → PR), chimera is a **provider-agnostic parallel multi-agent runtime** (cheap + frontier on different providers, cost-gated, single-agent UX). The richest mines are **(1) the 7-variant DAG node schema**, **(2) the `IIsolationProvider` + worktree-lifecycle code** (which chimera's checklist marks done but is actually missing), **(3) the strict `$nodeId.output.field` resolver**, **(4) the `{domain}.{action}_{state}` Pino logging convention**, **(5) the tier/alias model resolution + provider capability flags**, **(6) the bundled 17-workflow library** as prompt-craft reference, and **(7) Archon's docs/CLI/brand/HA deployment scaffold** as a head-start on a non-coding-agent surface. The only thing you should *not* port is Archon's Slack/Telegram/Discord/Web UI platform-adapter layer — chimera's TUI-first identity makes that a net negative.

---

## 1. Side-by-side positioning

| Concern | Archon | Chimera | Overlap? |
|---|---|---|---|
| Product surface | Remote-controlled, multi-platform (Slack/Telegram/CLI/Web) | Terminal-native, single CLI/TUI | **Different — complement** |
| User experience | Explicit invocation: "use archon to add dark mode" | Implicit: one agent, multi-agent behind the scenes | **Different — chimera is friendlier** |
| Execution model | Declarative YAML DAG with 7 node types | Programmatic agent mesh + serial quality gate | **Different — chimera is more flexible** |
| Provider support | Claude / Codex / Pi / Copilot / OpenCode SDKs (5) | Anything LiteLLM-style (theorized) | **chimera is more open** |
| Cost model | Untracked — user pays SDK provider | Per-task / per-session / per-day caps, projection, fallback | **chimera is ahead** |
| Context strategy | `persist_session`, `context: fresh/shared`, idle_timeout | Relay racing with handover docs, context-budget, masking | **Overlap — pick the best of each** |
| Isolation | Git worktree (default) + container/VM/remote abstraction | Worktree-isolation listed in checklist but **no implementation** | **Chimera can lift Archon's** |
| Workflow engine | First-class (loader, executor, DAG-executor, store, events) | None (orchestrator is a state machine) | **Chimera can adopt** |
| Variable substitution | `$1`…`$9`, `$ARGUMENTS`, `$nodeId.output.field`, `$ARTIFACTS_DIR`, `$WORKFLOW_ID`, `$BASE_BRANCH`, `$LOOP_USER_INPUT` | HandoffDocument with `goal/status/progress/decisions/next/context/files*` | **Different shapes, similar goals** |
| Per-user AI prefs | `user_ai_prefs` table: tiers/aliases/defaultProvider | `config.yaml` only | **Chimera can adopt** |
| Telemetry | One anonymous PostHog event, opt-out via env var | (None visible) | **Pattern transfer** |
| Multi-tenancy | Full (users / user_identities / per-user keys / per-user prefs) | None (single-user) | **Future — keep in mind** |

The 13 chimera checklist items that Archon already has battle-tested implementations for: `Worktree Isolation` (§3), `Auto-dream consolidation` (analogous, §8.4), `Context Relay & Masking` (Archon's `output_format` + masking, §3.3 of this report), `Conversation Recovery` (Archon's SessionStore, §7), `Persistent State Machine` (Archon's `session_state` table, §7), `Granular Permission Engine` (Archon's `PermissionSource`-equivalent, §9), `Secret Detection & Redaction` (Archon's masked-token logging, §5.3), `LSP Integration` (Archon doesn't — chimera leads), `Vim Mode` (chimera owns), `Skills System` (Archon has `.claude/skills/`, port the loader, §8.1), `MCP Integration` (Archon has full MCP, port the host, §8.2), `IDE Bridge` (chimera owns), `Agent Memory` (Archon's `workflow_node_sessions`, §6.2), `Remote Execution` (Archon has `host: 'remote'`, §3.5), `Fusion Mode` (Archon's provider capability tiers, §6.1), `Trio/Duo/Solo` (Archon's per-node `provider`/`model` override, §6.1).

---

## 2. The seven-primitive mining taxonomy

I grouped every mineable asset into one of seven categories. Counts in parentheses.

| # | Category | What it is | Best chimera landing pad |
|---|---|---|---|
| 1 | **Code modules** (lifted wholesale) | Production-grade TypeScript with tests | `packages/chimera-*/src/` |
| 2 | **Schemas / types** (re-shape) | Zod schemas + branded types | `packages/chimera-*/src/types.ts` |
| 3 | **Workflow YAML library** (inspiration) | 17 battle-tested prompt DAGs | `research/archon/.archon/workflows/defaults/` |
| 4 | **Patterns & conventions** (read & apply) | Logging naming, error contracts, etc. | `AGENTS.md` + module docstrings |
| 5 | **Operational artifacts** (copy & adapt) | Caddyfile, Docker, install script, brand | `deploy/`, `assets/`, `homebrew/` |
| 6 | **Test patterns** (lift carefully) | Mock isolation rules, fixtures | `__tests__/` |
| 7 | **Gaps Archon fills for chimera** | Things chimera's checklist says it needs | New files in chimera |

---

## 3. Asset catalog — code modules (lift wholesale)

### 3.1 Git worktree isolation provider (HIGHEST PRIORITY)

**Source:** `research/archon/packages/isolation/src/providers/worktree.ts` (1,260 lines)
**Why:** chimera's `AGENTS_CHECKLIST.md:29` marks `Worktree Isolation` as `[x]` complete, but no worktree code exists in `packages/`. This is the gap. Archon's `WorktreeProvider` is a 4-year-old, battle-tested production implementation.

**What you get (verbatim, 1,260 LOC):**
- `create(request)` — generates semantic branch name (`archon/issue-N`, `archon/pr-N-review`, `archon/thread-<hash>`, `archon/task-<slug>`)
- `destroy(envId, opts)` — best-effort cleanup, branch delete, remote branch delete, post-removal `git worktree prune` + verification
- `get/list/adopt/healthCheck` — full lifecycle
- Cross-clone ownership guard — refuses to adopt a worktree that belongs to a different clone of the same remote (subtle correctness bug Archon found and documented)
- Orphan-directory cleanup — handles the case where `git worktree remove` succeeded but left `.archon/` behind
- Stale-branch retry — deletes and recreates if branch already exists with stale commits
- Same-repo vs fork PR branching strategy — uses actual branch for same-repo (so changes push directly), synthetic `pr-N-review` for forks (can't push to forks)
- Per-worktree git identity stamping — `git config user.email`/`user.name` so workflow commits attribute to the originating user (relevant if chimera ever gains multi-user)

**Where it lands in chimera:**

```
packages/chimera-isolation/
  src/
    providers/
      worktree.ts          # port
    types.ts               # port, then narrow
    errors.ts              # port, replace archon-specific messages
    factory.ts             # port
    resolver.ts            # port, slim down (chimera has no multi-tenancy yet)
    store.ts               # PORT IWorkflowStore contract — chimera will need this for serializing runs
    worktree-copy.ts       # port
    index.ts               # re-exports
```

**Quick-wins to extract immediately** (don't need full port):
- `shortHash()` + `slugify()` helpers (lines 1244-1258) — useful for chimera's session/conversation IDs
- `resolveRepoLocalOverride()` (lines 71-113) — defensive path validation; copy the **pattern** (validate-then-throw with classified error) to chimera's `worktree.path` resolver
- `GIT_OPERATION_TIMEOUT_MS = 5 * 60 * 1000` — empirically correct (see issue #1119/#1029 cited in source)
- `applyGitIdentity()` (lines 764-781) — non-fatal pattern for stamping identity on a worktree

**Don't port:** `findWorktreeByBranch`, `verifyWorktreeOwnership`, `findExisting` cross-clone logic — chimera has no multi-clone case yet, would be dead code (KISS).

### 3.2 IIsolationProvider + types

**Source:** `research/archon/packages/isolation/src/types.ts` (353 lines)
**Why:** The full type contract — `IsolationRequest` (5 variants: issue/pr/review/thread/task), `IsolatedEnvironment` (worktree variant), `IIsolationProvider` (single interface), `ResolveRequest`, `IsolationResolution` discriminated union, `WorktreeStatusBreakdown`.

**Chimera-lift:** Take the `IIsolationProvider` interface and the `IsolationRequest` discriminated union. Strip the `pr`/`review`/`thread` variants — chimera's only call site is "task"-shaped. Keep the contract; collapse to 1-2 variants.

```typescript
// chimera-lift: chimera-isolation/src/types.ts (sketch)
export interface TaskIsolationRequest {
  workflowType: 'task';
  canonicalRepoPath: string;
  identifier: string;       // task id / feature name
  fromBranch?: string;
  gitIdentity?: { email: string; name?: string };
}

export interface IIsolationProvider {
  readonly providerType: 'worktree' | 'container' | 'remote';
  create(request: TaskIsolationRequest): Promise<IsolatedEnvironment>;
  destroy(envId: string, opts?: { force?: boolean; branchName?: string }): Promise<DestroyResult>;
  get(envId: string): Promise<IsolatedEnvironment | null>;
  list(codebaseId: string): Promise<IsolatedEnvironment[]>;
  healthCheck(envId: string): Promise<boolean>;
}
```

### 3.3 Provider registry pattern

**Source:** `research/archon/packages/providers/src/registry.ts` (188 lines) + `types.ts` (489 lines, contract layer)
**Why:** chimera's `chimera-providers` package has `model-registry.ts`, `provider-registry.ts`, but no formal `ProviderRegistration` record that bundles factory + capabilities + credentials in one declarative entry. Archon's registry is typed, enforces uniqueness, and exposes capability flags at registration time.

**Key abstractions to lift:**

```typescript
// archon/packages/providers/src/types.ts:349-376 — ProviderCapabilities
export interface ProviderCapabilities {
  sessionResume: boolean;
  mcp: boolean;
  hooks: boolean;
  skills: boolean;
  agents: boolean;          // inline sub-agent definitions
  toolRestrictions: boolean;
  structuredOutput: 'enforced' | 'best-effort' | false;  // tiered, not boolean
  envInjection: boolean;
  costControl: boolean;
  effortControl: boolean;
  thinkingControl: boolean;
  fallbackModel: boolean;
  sandbox: boolean;
  nativeTools: boolean;
}
```

**Note the `structuredOutput: 'enforced' | 'best-effort' | false`** — tiered, not boolean. This is the right model for chimera's providers: Claude/Codex enforce via grammar, Pi/Copilot are best-effort, and some providers can't. The "tiered union" is the right shape; chimera's current binary thinking ("structured output: yes/no") will produce false-positive capability.

**Registry lifting pattern:**

```typescript
// chimera-lift: chimera-providers/src/registry.ts (sketch)
export interface ProviderRegistration {
  id: string;
  displayName: string;
  factory: () => IAgentProvider;
  capabilities: ProviderCapabilities;     // static, not per-call
  /** True for cost-tracked providers (most). False for ambient/OSS. */
  costTracked: boolean;
}

const registry = new Map<string, ProviderRegistration>();
export function registerProvider(entry: ProviderRegistration): void {
  if (registry.has(entry.id)) throw new Error(`Provider '${entry.id}' already registered`);
  registry.set(entry.id, entry);
}
export function getAgentProvider(id: string): IAgentProvider {
  const e = registry.get(id);
  if (!e) throw new UnknownProviderError(id, [...registry.keys()]);
  return e.factory();
}
```

### 3.4 Pino logger with module binding

**Source:** `research/archon/packages/paths/src/logger.ts` (124 lines)
**Why:** chimera has no structured logger visible in `packages/`. Archon's `createLogger('orchestrator')` pattern + the `{domain}.{action}_{state}` event-naming convention is the cleanest I've seen.

**Lift (whole file):**
- `createLogger(module: string)` — returns Pino child logger with `{ module }` binding
- `setLogLevel` / `getLogLevel` — runtime level switch
- Auto-detect TTY for pino-pretty vs JSON, **with a documented Bun/$bunfs/ fallback** (see lines 70-83 — critical detail: `pino-pretty` as a destination stream rather than a worker-thread transport, avoids Bun's `require.resolve` crash)
- `silent` level for `--json` CLI mode (keeps stdout pure)

**Event-naming convention** (from source comments):
```
{domain}.{action}_{state}
Examples:
  session.create_started
  session.create_completed
  session.create_failed
  workflow.step_started
  isolation.create_failed
  provider.selected
```

Apply to chimera's existing event-stream.ts: rename events from generic to `domain.action_state`.

### 3.5 Provider-neutral contract types

**Source:** `research/archon/packages/providers/src/types.ts` (489 lines, **zero SDK imports**)
**Why:** This is a textbook example of an SDK-isolation boundary. The file's docstring says it explicitly:
> CONTRACT LAYER — no SDK imports, no runtime deps.
> HARD RULE: This file must never import SDK packages or other @archon/* packages.

Chimera's `chimera-providers/src/model-adapter.ts` would benefit from copying this discipline. Specifically:

- `MessageChunk` discriminated union (lines 178-222) — 7 chunk types covering assistant/system/thinking/result/rate_limit/tool/tool_result/workflow_dispatch
- `AgentRequestOptions` (lines 242-262) — `model`, `abortSignal`, `systemPrompt`, `outputFormat: { type: 'json_schema'; schema }`, `env`, `maxBudgetUsd`, `fallbackModel`, `forkSession`, `persistSession`, `nativeTools`
- `SendQueryOptions = AgentRequestOptions & { nodeConfig, assistantConfig }` — separates "universal" from "workflow/assistant-specific"
- `NativeTool` (lines 276-281) — provider-neutral in-process tool: `{ name, description, inputSchema: JSONSchema, handler: async (input) => string }`. Each provider translates `inputSchema` to its SDK form.
- `IAgentProvider` (lines 463-488) — single 3-method interface: `sendQuery(prompt, cwd, resumeSessionId?, options?) → AsyncGenerator<MessageChunk>`, `getType()`, `getCapabilities()`

**Why this matters for chimera:** The current `chimera-providers` package has 14+ files (`budget-enforcer`, `cost-calculator`, `cost-projection`, `cost-tracker-provider`, `errors`, `fallback-chain`, `model-adapter`, `model-comparator`, `model-registry`, `provider-factory`, `provider-registry`, `rate-limiter`) without a clear single contract surface. Archon's pattern enforces a single `types.ts` that everyone imports from — breaks the SDK-coupling cycle.

### 3.6 Output reference resolver (no-silent-drop)

**Source:** `research/archon/packages/workflows/src/output-ref.ts` (157 lines)
**Why:** chimera has `HandoffDocument` and `HandoffProtocol` (465+541 lines), but no mechanism to **strictly** read another node's output. Archon's resolver is the gold standard for "fail loud, never silently degrade."

**The contract (3-tier resolution table, lines 14-23):**

| Producer state | Field access | Behavior |
|---|---|---|
| Declared-schema (has `output_format.properties`) | field in schema, present | Return value |
| Declared-schema | field in schema, absent/null | Return `''` (declared-optional) |
| Declared-schema | field **not in** schema | **THROW** (typo) |
| Structured payload, no schema (legacy) | key present | Return value |
| Structured payload, no schema | key absent | Return `''` (lenient — backward compat) |
| Schemaless (bash/script) | output not JSON | **THROW** (`unparseable`) |
| Schemaless | JSON, key present | Return value |
| Schemaless | JSON, key absent | **THROW** (`missing-key`) |
| Producer skipped/pending | any | **THROW** (`producer-not-run`) |

**Why it matters for chimera:** chimera's HandoffProtocol is "lossy" by design (it's a compaction handoff). But for chimera's draft→verify→challenge→synthesize pipeline, you need a way for `verify` to read `draft.output.specificField` and have it fail loud if `draft` didn't emit that field, not silently produce an empty string. This is the missing link.

**Lift pattern** (chimera-context/src/output-ref.ts):
```typescript
// chimera-lift: strict output reference resolver
export type FieldResolution = { kind: 'value'; value: unknown } | { kind: 'empty' };
export class OutputRefError extends Error { /* 'not-in-schema' | 'unparseable' | 'missing-key' | 'producer-not-run' */ }

export function resolveNodeOutputField(
  nodeOutput: NodeOutput, nodeId: string, field: string
): FieldResolution { /* port verbatim */ }
```

### 3.7 Workflow discovery with 3-scope precedence

**Source:** `research/archon/packages/workflows/src/workflow-discovery.ts` (392 lines)
**Why:** chimera has no `config.yaml` + bundled-defaults + user-override pattern. The 3-scope precedence is: `bundled < global < project` (higher overrides lower by filename). This is the standard pattern for CLI tooling (git config, ssh config, npmrc).

**Lifts:**
- `loadWorkflowsFromDir(dirPath, depth=0)` with `MAX_DISCOVERY_DEPTH = 1` — depth-capped recursive scan, one broken file doesn't abort loading the rest
- 3-scope load order: bundled → home (`~/.chimera/workflows/`) → project (`.chimera/workflows/`)
- Per-file `WorkflowLoadError` with `errorType: 'read_error' | 'parse_error' | 'validation_error'` — surfaced to the user with actionable hints
- `discoverWorkflowsWithConfig(cwd, loadConfig)` — wrapper that respects `defaults.loadDefaultWorkflows: false` opt-out

### 3.8 Markdown-fence-tolerant JSON parser

**Source:** `research/archon/packages/workflows/src/output-ref.ts:82-100`
**Why:** Models and scripts frequently wrap JSON in ` ```json ... ``` ` fences. The `FENCE_RE` extracts the inner content before parsing. Drop this 18-line helper into chimera's `output_format` parser.

```typescript
const FENCE_RE = /^[\s\S]*?```(?:json)?\s\n([\s\S]*?)\n\s```[\s\S]*$/;
function parseOutputObject(text: string): Record<string, unknown> | undefined {
  if (!text) return undefined;
  let candidate = text;
  const fenceMatch = FENCE_RE.exec(candidate);
  if (fenceMatch?.[1]) candidate = fenceMatch[1];
  try { return asPlainObject(JSON.parse(candidate)); } catch { return undefined; }
}
```

### 3.9 Bundled skill loader

**Source:** `research/archon/packages/cli/src/bundled-skill.ts` (~150 lines, inferred from file listing)
**Why:** chimera's `Skills System` checklist item is `[ ]` pending. The bundled-defaults pattern (embed at compile time, fall back to filesystem in dev) is the right shape. Read the file before scaffolding.

### 3.10 Git worktree primitives (already have, can borrow patterns)

**Source:** `research/archon/packages/git/src/` (branch.ts, exec.ts, repo.ts, types.ts, worktree.ts)
**Why:** Branded types (`RepoPath`, `BranchName`, `WorktreeInfo`), `execFileAsync` wrapper (no shell injection), canonical path resolution. Use these as a reference for the same primitives chimera will need in its own git tooling.

---

## 4. Asset catalog — schemas and types

### 4.1 DAG node schema (the single biggest missing piece)

**Source:** `research/archon/packages/workflows/src/schemas/dag-node.ts` (700 lines)
**Why this is the headline mine:** Chimera's session orchestrator is a 1,231-LOC state machine. It does everything in code. Archon proves there's a 7-variant declarative schema that captures the same surface. Chimera's main growth lever is letting users describe multi-agent workflows in YAML and have the orchestrator execute them, not write new orchestrator state for every new use case.

**The 7 node types** (mutually exclusive via `superRefine`):

| Variant | Trigger | Chimera equivalent | Mine? |
|---|---|---|---|
| `commandNode` (`command: <name>`) | Runs a named command file from `.archon/commands/` | `side-query.ts` (366 LOC) — runtime invocation, not file-based | **Yes** — adopt file-based command pattern |
| `promptNode` (`prompt: <text>`) | Inline prompt (no command file) | `prompts.ts` (945 LOC) | **Yes** — most of the 945 LOC is a DSL; replace with inline YAML |
| `bashNode` (`bash: <script>`, `timeout`) | Shell script, no AI, stdout captured | None | **Yes** — missing in chimera |
| `scriptNode` (`script: <inline>`, `runtime: bun\|uv`, `deps?`, `timeout?`) | Run TS or Python via bun/uv | None | **Yes** — missing in chimera |
| `loopNode` (`loop: { prompt, until, max_iterations, fresh_context, interactive }`) | Iterative AI prompt with completion signal | `relay-racing.ts` (221 LOC) — different purpose | **Yes** — different kind of loop, both needed |
| `approvalNode` (`approval: { message, capture_response?, on_reject? }`) | Human-in-the-loop gate | None | **Yes** — missing in chimera |
| `cancelNode` (`cancel: <reason>`) | Terminate run | None | **Yes** — useful for guard conditions |

**Common base fields** (every node shares these, lines 140-204):
- `id: string` (kebab-case validated via regex `/^[a-z0-9]+(-[a-z0-9]+)*$/`)
- `depends_on: string[]` — DAG edges
- `when: string` — predicate expression (resolved by `condition-evaluator.ts`)
- `trigger_rule: 'all_success' | 'one_success' | 'none_failed_min_one_success' | 'all_done'` — JOIN semantics for parallel parents
- `model, provider, context: 'fresh'|'shared'` — per-node model override
- `output_format: Record<string, unknown>` — Zod-schema-validated JSON output contract
- `allowed_tools, denied_tools: string[]` — per-node tool restrictions
- `idle_timeout: number` — ms timeout for an idle node
- `retry: StepRetryConfig` — bounded retry policy
- `hooks: WorkflowNodeHooks` — per-node SDK hook callbacks (Claude-only)
- `mcp: string` — path to MCP server config (Claude-only)
- `skills: string[]` — per-node skill preloading
- `agents: Record<string, AgentDefinition>` — inline sub-agent definitions for the Task tool
- `effort, thinking, maxBudgetUsd, systemPrompt, fallbackModel, betas, sandbox` — Claude-SDK-advanced
- `persist_session: boolean` — cross-run provider session continuity
- `output_type: string` — typed output sidecar (`$ARTIFACTS_DIR/nodes/<id>.md` + `<id>.meta.json`)

**Chimera-lift:** Create `packages/chimera-workflows/src/schemas/dag-node.ts`. Strip out Claude-specific fields (`hooks`, `mcp`, `agents`, `betas`, `sandbox`, `thinking`) — chimera is provider-agnostic. Add chimera-specific fields: `cost_cap: number`, `provider_pair: { cheap: string, frontier: string }`. The discriminated union pattern + `superRefine` for mutual exclusivity is exactly the right shape.

### 4.2 TriggerRule union (5 strategies)

**Source:** `research/archon/packages/workflows/src/schemas/dag-node.ts:23-33`

```typescript
export const triggerRuleSchema = z.enum([
  'all_success',           // all parents succeeded (Airflow default)
  'one_success',           // at least one parent succeeded
  'none_failed_min_one_success',  // mix of successes/skips, no failures
  'all_done',              // all parents settled (success OR fail OR skip)
]);
export const TRIGGER_RULES = triggerRuleSchema.options;  // derived, not duplicated
```

**Why chimera needs it:** chimera's quality gate (`draft → verify → challenge → synthesize`) currently runs in a hard-coded sequence. Trigger rules let users say "run verify AND challenge in parallel, proceed to synthesize when AT LEAST ONE succeeds" — saves an entire round-trip on the happy path. Critical for the trio/duo/solo modes in `research/trio-duo-solo-improvement-plan.md`.

### 4.3 WorktreeCreateConfig (per-repo overrides)

**Source:** `research/archon/packages/isolation/src/types.ts:253-275`
**Lifts:** `baseBranch`, `copyFiles: string[]`, `initSubmodules: boolean`, `path: string` (per-repo worktree dir). All validated defensively (see §3.1 quick-wins). Drop into chimera's `config.yaml` schema as `isolation:` block.

### 4.4 SystemPromptPreset

**Source:** `research/archon/packages/providers/src/types.ts:228-236`
```typescript
export interface SystemPromptPreset {
  type: 'preset';
  preset: 'claude_code';
  append?: string;
  excludeDynamicSections?: boolean;
}
export type SystemPromptInput = string | string[] | SystemPromptPreset;
```

**Chimera-lift:** chimera's `prompts.ts` (945 LOC) is a hand-rolled prompt-template DSL. Replace with this 3-shape union: a raw string, a string array (concatenated), or a preset (cacheable prefix + dynamic append). Lets the prompt-cache work, drops most of the DSL.

### 4.5 Branded git types

**Source:** `research/archon/packages/git/src/types.ts`
**Pattern:** Use TypeScript branded types to prevent passing a `BranchName` where `RepoPath` is expected. ~50 lines of code that prevents an entire class of bug.

```typescript
type Brand<T, B> = T & { readonly __brand: B };
export type RepoPath = Brand<string, 'RepoPath'>;
export type BranchName = Brand<string, 'BranchName'>;
export type WorktreePath = Brand<string, 'WorktreePath'>;
export function toRepoPath(s: string): RepoPath { return s as RepoPath; }
```

---

## 5. Asset catalog — patterns and conventions

### 5.1 `when:` condition evaluator

**Source:** `research/archon/packages/workflows/src/condition-evaluator.ts`
**What:** A small interpreter for the `when: "$node-id.output.field == 'value'"` predicate syntax. Resolves node output references via `resolveNodeOutputField()` (the strict resolver from §3.6). Used for routing subagent activation, conditional fan-out, and "skip if already done" guards.

**Chimera-lift:** chimera's task-router has 118 LOC of hard-coded routing logic. A `when:` evaluator + a few node-level `when:` predicates is more flexible and lets users customize routing without forking chimera.

### 5.2 Fail-Fast + Explicit Errors

**Source:** Archon CLAUDE.md + `isolation/src/errors.ts` (the `classifyIsolationError` pattern)
**Pattern:** When a low-level error bubbles up, classify it into an actionable user message *at the boundary*, not silently swallowed. Five canonical buckets (from the source):
- `permission denied` → "Check file permissions and try again"
- `not a git repository` → "Ensure the workspace was cloned correctly"
- `configured base branch` → "Fix your .archon/config.yaml baseBranch"
- `No such file or directory` / `does not exist` → "Already removed" (idempotent OK)
- `already exists` (git branch) → "Stale branch — resetting" (recoverable)

**Chimera-lift:** chimera's `chimera-tools/src/tool-executor.ts` should adopt this classification. Currently the error path appears to bubble raw `Error.message` strings.

### 5.3 Structured logging — never log secrets

**Source:** `research/archon/packages/paths/src/logger.ts:34` (use `token.slice(0, 8) + '...'`), CLAUDE.md "Never log" rule
**Chimera-lift:** Add to chimera's `secret-detector.ts` (`chimera-core/src/security/`): explicit `maskValue(secret: string): string` helper that returns first-8-chars + ellipsis. Use it in `cost-tracker.ts` (token counts are fine, costs are fine, but if a tool returns a credential, mask it).

### 5.4 Variable substitution — the full set

**Source:** `research/archon/packages/workflows/src/utils/variable-substitution.ts` + CLAUDE.md "Variable Substitution" block
**Variables Archon supports** that chimera doesn't:
- `$1`…`$9` (positional args)
- `$ARGUMENTS` (whole arg string)
- `$ARTIFACTS_DIR` (per-run artifact dir, pre-created)
- `$WORKFLOW_ID` (run UUID)
- `$BASE_BRANCH` (auto-detected default branch)
- `$DOCS_DIR` (configured docs path, never throws)
- `$LOOP_USER_INPUT` (populated only on first iteration of resumed interactive loop)
- `$REJECTION_REASON` (populated only in `on_reject` prompts)
- `$LOOP_PREV_OUTPUT` (cleaned output of previous loop iteration)

**Chimera-lift:** Adopt `$ARTIFACTS_DIR` and `$BASE_BRANCH` immediately — they map cleanly to chimera's task router and isolation layer. `$LOOP_PREV_OUTPUT` is a clean fit for chimera's relay-racing handoff.

### 5.5 Session resume capability bit

**Source:** `research/archon/packages/providers/src/types.ts:351` `sessionResume: boolean`
**Pattern:** Each provider declares whether it supports session resume. Chimera's `persist_session`-style feature in the agent mesh should gate on this capability bit, exactly as Archon does.

### 5.6 Mock isolation in tests

**Source:** Archon CLAUDE.md "Test isolation (mock.module pollution)"
**Pattern (critical for chimera's vitest setup):** Bun's `mock.module()` is process-global and irreversible. `mock.restore()` does NOT undo it (oven-sh/bun#7823). The solution: split tests that conflict into separate `bun test` invocations via `package.json` scripts. Archon has 20+ test-batch files for `@archon/core` alone.

**Chimera-lift:** chimera uses Vitest, not Bun, so the `mock.module` problem is different — but the **principle** of "tests that share state must run in separate processes" is universal. Audit chimera's `__tests__/` for shared state, and if any are found, split them.

### 5.7 The "after X" plan-insertion-point convention

**Source:** Archon CLAUDE.md "Plan insertion points"
**Pattern:** When inserting code, use **stable text anchors** like `// after the 'throws on ...' test block`, never raw line numbers. Line numbers drift; anchors don't.

**Chimera-lift:** Adopt this in chimera's `AGENTS.md` so all agent-generated patches use anchor-based insertions.

### 5.8 `isPersistableNode()` — single source of truth for capability gates

**Source:** `research/archon/packages/workflows/src/schemas/dag-node.ts:691-699`
**Pattern:**
```typescript
export function isPersistableNode(node: DagNode): boolean {
  return !isLoopNode(node) && !isApprovalNode(node) && !isCancelNode(node) && !isScriptNode(node) && !isBashNode(node);
}
```
**Why:** Five different "is this node eligible for X?" predicates would drift. One function + comment ("loop/approval/cancel/script/bash excluded — they either make no provider call or manage their own per-iteration sessions") is right. Chimera has a similar `PersistableNode`-shaped problem in its agent mesh — should pick this pattern.

### 5.9 Pre-PR validation ritual

**Source:** Archon CLAUDE.md "Always run before creating a pull request: `bun run validate`"
**What it runs (8 checks):**
1. `check:bundled` — verify the compiled-bundle file is in sync
2. `check:bundled-skill` — same for skills
3. `check:bundled-schema` — same for SQL schema
4. `check:pi-vendor-map` — same for provider vendor map
5. Type-check
6. Lint (max-warnings 0)
7. Format check
8. Tests

**Chimera-lift:** chimera has `pnpm validate` (probably typecheck + lint + test). Add the **generated-artifact drift checks** — they catch the class of bug where a committed `generated.ts` is stale relative to source.

### 5.10 Engineering principles worth adopting

**Source:** Archon CLAUDE.md "Engineering Principles" block
**Five to adopt verbatim:**
1. **KISS** — "Prefer straightforward control flow over clever meta-programming"
2. **YAGNI** — "Do not add config keys, interface methods, feature flags without a concrete accepted use case"
3. **DRY + Rule of Three** — "Extract shared utilities only after the same pattern appears at least three times and has stabilized"
4. **SRP + ISP** — "Keep each module and package focused on one concern"
5. **Fail Fast + Explicit Errors** — "Prefer throwing early with a clear error for unsupported or unsafe states — never silently swallow errors"

**Chimera-specifically violates these:**
- YAGNI: chimera's blueprint references "auto-dream consolidation," "voice mode," "vim mode," "ide bridge" — all of which are speculative. Drop them or move to a "future" doc.
- Fail Fast: chimera's `cost-tracker.ts` likely swallows provider errors; verify.

---

## 6. Asset catalog — workflow YAML library (inspiration)

`research/archon/.archon/workflows/defaults/` has 17 production-grade workflow YAMLs. **Read them as a prompt-craft reference**, not as code to copy.

| Workflow | LOC | Pattern to study |
|---|---|---|
| `archon-idea-to-pr.yaml` | 152 | 8-phase pipeline: plan → setup → confirm → implement → validate → finalize → 5-parallel-review → synthesize → fix → summary |
| `archon-comprehensive-pr-review.yaml` | 49 | **Direct match for chimera's verify/challenge stage** — 5 parallel reviewers, `trigger_rule: one_success` for synthesis |
| `archon-ralph-dag.yaml` | 760 | **The fresh-context loop pattern** — `loop: { prompt, until: COMPLETE, max_iterations: 15, fresh_context: true }` |
| `archon-fix-github-issue.yaml` | (medium) | Classify-then-route pattern (3 classify nodes, 4 parallel branches, single synthesize) |
| `archon-smart-pr-review.yaml` | (medium) | Two-stage: classify-complexity → targeted reviewers (more selective than comprehensive) |
| `archon-piv-loop.yaml` | (small) | Plan-Implement-Validate loop with human review |
| `archon-interactive-prd.yaml` | (small) | Approval-node usage: `approval: { message, capture_response: true, on_reject: { prompt, max_attempts: 3 } }` |
| `archon-resolve-conflicts.yaml` | (medium) | Bash-node usage with retry, conditional rebase |
| `archon-refactor-safely.yaml` | (small) | Linter-gate pattern (run `tsc --noEmit` between every edit) |
| `archon-architect.yaml` | (small) | Sweep pattern (read all of X, generate health report) |
| `archon-remotion-generate.yaml` | (small) | Asset pipeline pattern (image → script → render) |
| `archon-test-loop-dag.yaml` | (small) | Counter-driven loop (test, count, fix) |
| `archon-workflow-builder.yaml` | (small) | Meta-workflow (generates other workflows) |

**The 3 highest-value patterns to internalize:**

1. **Parallel-reviewer-fanout + synthesize** (`archon-comprehensive-pr-review.yaml:21-44`)
   ```yaml
   - id: code-review          - id: error-handling        - id: test-coverage
     command: ...                command: ...                command: ...
     depends_on: [sync]          depends_on: [sync]          depends_on: [sync]

   - id: synthesize
     command: archon-synthesize-review
     depends_on: [code-review, error-handling, test-coverage, ...]
     trigger_rule: one_success   # proceed when AT LEAST ONE succeeded
   ```
   This is **exactly chimera's quality gate** (verify + challenge in parallel, synthesize on first success). Adapt verbatim.

2. **Fresh-context loop** (`archon-ralph-dag.yaml:189-657`)
   ```yaml
   - id: implement
     depends_on: [validate-prd]
     model: large
     loop:
       prompt: |
         You are in a FRESH session — you have no memory of previous iterations.
         Read state from disk, implement ONE story, validate, commit, exit.
       until: COMPLETE
       max_iterations: 15
       fresh_context: true   # ← the key flag
   ```
   This is the cleanest "context-rotate-on-iteration" pattern I've seen. Chimera's relay-racing handoff document approach is a generalization of this; the simpler version is a clean fit for "iterate until done" workflows.

3. **Approval gate with on_reject** (`archon-interactive-prd.yaml`)
   ```yaml
   - id: review
     approval:
       message: "Does the PRD look right?"
       capture_response: true     # store the user's text as $review.output
       on_reject:
         prompt: "Incorporate the reviewer's feedback: $REJECTION_REASON"
         max_attempts: 3          # auto-retry up to 3 times before giving up
     depends_on: [draft]
   ```
   Chimera has nothing like this. The `capture_response: true` + `$REJECTION_REASON` variable is the right shape for "human in the loop but with automatic rework."

---

## 7. Asset catalog — operational artifacts

### 7.1 Install scripts

**Source:** `https://archon.diy/install` (curl), `https://archon.diy/install.ps1` (PowerShell), `homebrew/coleam00-archon-archon.rb`
**Why:** chimera's `Getting Started` in `README.md` says `pnpm install && pnpm build && pnpm chimera`. That's a developer setup, not a user install. Archon's one-liner install is what makes it a product.

**Chimera-lift:** A `scripts/install.ps1` + `scripts/install.sh` pair, plus a homebrew formula. ~150 lines of bash + ~100 lines of Ruby. The `install.sh` pattern:
1. Detect OS/arch
2. Download binary from GitHub releases
3. Verify SHA256
4. Place in `~/.local/bin/`
5. Print next steps

### 7.2 Caddy reverse-proxy config

**Source:** `research/archon/Caddyfile.example`
**Why:** When chimera grows a server component (the `Trio/Duo/Solo improvement plan` references a remote mode), Caddy is the right reverse proxy. Archon's `Caddyfile.example` includes: HTTPS auto, websocket upgrade, `/api/*` rate limiting, `/webhooks/*` whitelist. Adapt the patterns.

### 7.3 Docker deployment

**Source:** `research/archon/Dockerfile`, `docker-compose.yml`, `docker-compose.override.example.yml`, `Dockerfile.user.example`
**What's there:** Multi-stage Bun build, postgres service profile, user-extension pattern (`Dockerfile.user.example` lets users customize without forking the upstream image). **The `Dockerfile.user.example` pattern is the headline** — it lets users add personal tools without affecting maintainer files or committing user-specific config to git. Chimera will need this if it ever ships a Docker image.

### 7.4 Brand foundation

**Source:** `research/archon/packages/web/src/index.css` (design tokens) + `packages/docs-web/src/content/docs/brand/index.md` (canonical brand guide)
**Why:** chimera's TUI doesn't need this, but if chimera ever adds a Web UI (the "Workflow Builder" use case), the brand-token approach prevents palette drift. Two principles: **(1) use brand tokens, not ad-hoc hex values**, **(2) introducing a new visual token means updating both the token source and the brand guide**.

### 7.5 Test fixtures (safe + malicious YAML)

**Source:** `research/archon/.archon/scripts/__tests__/fixtures/benign/clean-workflow.yaml` + `malicious/unsafe_permissions.yaml`
**Why:** When chimera builds a workflow loader, it needs both happy-path AND adversarial test inputs. Archon's fixture split (benign + malicious) is the right shape. Port the test cases (don't port the YAMLs — they're tied to Archon-specific commands).

### 7.6 Per-user AI prefs storage

**Source:** `research/archon/packages/core/src/schemas/user-ai-prefs-row.ts` + 14th-row in CLAUDE.md DB schema
**Pattern:** JSON-as-TEXT columns for tiers/aliases/defaultProvider. NON-encrypted (model names aren't secrets). One row per user, `UNIQUE(user_id)`. Folded into `buildAiProfile` as the highest-precedence layer (global < repo < user).
**Chimera-lift:** chimera has `config.yaml` for tiers/aliases; the per-user layer would let different chimera users on the same machine have different defaults. Optional, but the pattern is clean.

### 7.7 Telemetry

**Source:** `research/archon/packages/paths/src/telemetry.ts` (file listed) + CLAUDE.md "Telemetry" block
**Pattern:** One anonymous event per workflow invocation. Random install UUID at `~/.chimera/telemetry-id`. Opt-out via `CHIMERA_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1`. Self-host PostHog by setting `POSTHOG_API_KEY` + `POSTHOG_HOST`.
**Chimera-lift:** If chimera ever wants a health/metrics stream, this is the minimum-viable shape. 5-10 minute implementation.

---

## 8. Asset catalog — test patterns

### 8.1 Test isolation rules (mock.module pollution)

See §5.6.

### 8.2 Lazy-initialized logger for test mocks

**Source:** `research/archon/packages/isolation/src/providers/worktree.ts:44-49`
```typescript
let cachedLog: ReturnType<typeof createLogger> | undefined;
function getLog(): ReturnType<typeof createLogger> {
  if (!cachedLog) cachedLog = createLogger('isolation.worktree');
  return cachedLog;
}
```
**Why:** Module-level `const log = createLogger(...)` calls Pino at import time, which makes `mock.module('@archon/paths')` impossible in tests. Lazy-init lets tests intercept `createLogger` before any logger is created.

**Chimera-lift:** Audit all `chimera-*/src/*.ts` for module-level logger creation. Replace with lazy-init pattern if found.

### 8.3 `output_format` schema validation tests

**Source:** `research/archon/packages/workflows/src/schemas.test.ts` (file listed) + `output-ref.test.ts` (file listed)
**Pattern:** The schema test fixtures should cover: declared-schema with all fields, declared-schema with optional field absent, declared-schema with unknown field (throws), schemaless with markdown-fenced JSON, schemaless with malformed JSON, schemaless with missing key, producer-not-run.
**Chimera-lift:** Copy the test cases into chimera's eventual `output_format` parser tests. 12-15 test cases that catch 95% of the bug surface.

### 8.4 Auto-dream consolidation precedent

**Source:** Archon's `workflow_node_sessions` table (DB row schema, lines 11-12 of CLAUDE.md)
**Pattern:** A per-node, per-scope, per-provider session ID persisted across workflow re-runs. Lets "story completed in run 1" continue in "run 2 of the same loop" with full session history.
**Chimera-lift:** chimera's `chimera-session/` package already has `session-store.ts` (4 files in `src/`). Compare schemas. If chimera's is per-session and Archon's is per-node, Archon's is more granular and likely better. **But:** chimera's `handoff-protocol.ts` compaction-handoff is a different mechanism. Don't conflate the two; they solve different problems.

---

## 9. Asset catalog — gaps Archon fills for chimera

These are things chimera's checklist says it needs but doesn't have. Archon has working implementations.

| Chimera checklist item | Status | Archon source | Chimera port priority |
|---|---|---|---|
| `Worktree Isolation` ([x] but no code) | **Critical gap** | `packages/isolation/` (1,260 + 353 + ~200 LOC) | **P0** — direct port of §3.1 |
| `Auto-Dream Consolidation` | [ ] | `workflow_node_sessions` + `assistantConfig` persistence | **P3** — concept-level only |
| `Context Relay & Masking` | [~] partial | `output_format` strict resolver + masking helpers | **P1** — lift §3.6 |
| `Conversation Recovery` | [x] | `SessionStore` (chimera already has — port naming patterns only) | P3 |
| `Persistent State Machine` | [ ] | `remote_agent_sessions` table | P2 |
| `Granular Permission Engine` | [x] | `PermissionSource` (file inferred) | Already done — read for naming |
| `Secret Detection & Redaction` | [x] | Archon doesn't have a separate module — it's the `maskValue()` + log rules | Already done |
| `Skills System` | [ ] | `packages/cli/src/bundled-skill.ts` | P1 |
| `MCP Integration` | [ ] | `packages/providers/src/mcp/` (file listed) | P1 |
| `Remote Execution` | [ ] | `IsolationProviderType: 'remote'` (in types) | P3 |
| `Fusion Mode (OpenRouter Parity)` | [~] | Provider capability flags + tier resolution | P0 |
| `Trio/Duo/Solo` | [~] | Per-node `provider`/`model` override + quality-gate DAG | P0 |
| `AGENTS.md / CLAUDE.md pattern` | Already has | Archon's own CLAUDE.md is the reference | Done |
| `Telemetry` | [ ] | One anonymous event + opt-out | P3 |
| `Web UI` | [ ] | Full React + shadcn/ui + Zustand | Out of scope (TUI-first) |
| `Bundled prompts (per task)` | [ ] | `.archon/commands/defaults/` (100s of files) | P1 |
| `Approval gate (human-in-loop)` | [ ] | `approvalNode` + `on_reject` | P1 |
| `Fresh-context iteration loop` | [ ] | `loopNode` with `fresh_context: true` | P0 |

---

## 10. Asset catalog — what NOT to mine

| Archon feature | Why skip |
|---|---|
| Platform adapters (Slack, Telegram, Discord, GitHub, Web) | chimera is TUI-first. Multi-platform UX would dilute the single-agent identity that is chimera's main differentiator. |
| Multi-tenant users / per-user OAuth | chimera is single-user today. The tables, encryption, `user_identities` mapping — all premature for chimera. |
| 18-table database | chimera has fewer concepts. Adopt only the 4-5 tables chimera needs (sessions, messages, runs, isolation_environments, env_vars). |
| OpenAPI 3.0 / Hono REST server | chimera's CLI is the API. If/when chimera adds a server, the patterns transfer, but the volume is overkill today. |
| The `archon-` naming prefix everywhere | chimera's "chimera-" prefix is fine. Don't migrate. |
| Better Auth (web login) | chimera is local-only. Skip. |
| Homebrew formula | chimera is pnpm-based; npm-based homebrew is the wrong shape. |
| `bundled-defaults.generated.ts` compile-time embedding | Only valuable if chimera ships a binary. Skip until chimera ships a binary. |

---

## 11. Concrete 30-day port plan (the mineable work)

**Week 1 — Critical foundation**
1. Port `WorktreeProvider` to `packages/chimera-isolation/src/providers/worktree.ts` (3.1). Keep the cross-clone guard even if unused — it's correct.
2. Port the `IIsolationProvider` interface to `packages/chimera-isolation/src/types.ts` (3.2). Strip to 1 variant.
3. Port the `output-ref.ts` strict resolver to `packages/chimera-context/src/output-ref.ts` (3.6). Wire into `handoff-protocol.ts` for cross-node reads in the quality gate.
4. Add `cost_cap: number` to a draft `DagNode` schema in `packages/chimera-workflows/src/schemas/dag-node.ts` (4.1). Use `superRefine` for mutual exclusivity — copy the pattern.

**Week 2 — Quality gate improvements**
5. Adopt the parallel-reviewer-fanout pattern from `archon-comprehensive-pr-review.yaml` (6) — re-implement chimera's `verify` + `challenge` as parallel nodes with `trigger_rule: one_success` for the synthesize step.
6. Add the `loopNode` shape to the schema (4.1). Wire `fresh_context: true` through to chimera's `relay-racing.ts` so each loop iteration is a fresh context.
7. Add the `approvalNode` shape. Wire to chimera's TUI as an interactive prompt gate.
8. Adopt the `{domain}.{action}_{state}` event-naming convention in `event-stream.ts` (3.4). Rename existing events to match.

**Week 3 — Provider & telemetry**
9. Adopt the `ProviderCapabilities` tiered-union shape (3.3). Replace chimera's binary capability flags.
10. Adopt the `MessageChunk` discriminated union (3.5) for the agent-mesh's response stream.
11. Add the `tiers` / `aliases` / `@alias` resolution from Archon's `model-validation.ts` — it's a clean fit for chimera's existing `config.yaml` `tiers:` block.
12. Implement the lazy-init logger pattern (8.2) across all `chimera-*/src/*.ts` modules that create loggers at module load.

**Week 4 — Workflow library & polish**
13. Pick the 3 most-relevant bundled workflows from `archon/.archon/workflows/defaults/` and port them as chimera's first 3 bundled workflows: `archon-comprehensive-pr-review.yaml` (parallel reviewers), `archon-ralph-dag.yaml` (fresh-context loop), `archon-piv-loop.yaml` (plan-implement-validate).
14. Add the `when:` condition evaluator from `condition-evaluator.ts` (5.1). Use the strict output-ref resolver.
15. Add the `output_format` strict schema validation to chimera's existing prompt-response parsing (4.1).
16. Add the `output_type` sidecar concept — typed `$ARTIFACTS_DIR/nodes/<id>.md` + `<id>.meta.json` artifacts for downstream consumers.
17. Write the 5 engineering principles from §5.10 into chimera's `AGENTS.md` as binding rules.

**Out of scope for the 30-day plan:** platform adapters, multi-tenancy, web UI, install scripts, brand foundation, telemetry, Docker. Document them in `research/` for later.

---

## 12. Asset index — quick reference

| File | Lines | Category | Priority |
|---|---|---|---|
| `research/archon/packages/isolation/src/providers/worktree.ts` | 1,260 | Code | **P0** |
| `research/archon/packages/isolation/src/types.ts` | 353 | Schema | **P0** |
| `research/archon/packages/workflows/src/schemas/dag-node.ts` | 700 | Schema | **P0** |
| `research/archon/packages/workflows/src/output-ref.ts` | 157 | Code | **P0** |
| `research/archon/packages/providers/src/registry.ts` | 188 | Code | **P0** |
| `research/archon/packages/providers/src/types.ts` | 489 | Schema | **P0** |
| `research/archon/packages/paths/src/logger.ts` | 124 | Code | P1 |
| `research/archon/packages/workflows/src/workflow-discovery.ts` | 392 | Code | P1 |
| `research/archon/packages/workflows/src/utils/variable-substitution.ts` | 33 | Code | P1 |
| `research/archon/.archon/workflows/defaults/archon-comprehensive-pr-review.yaml` | 49 | Pattern | P1 |
| `research/archon/.archon/workflows/defaults/archon-ralph-dag.yaml` | 760 | Pattern | P1 |
| `research/archon/.archon/workflows/defaults/archon-idea-to-pr.yaml` | 152 | Pattern | P2 |
| `research/archon/packages/workflows/src/condition-evaluator.ts` | (read) | Code | P2 |
| `research/archon/packages/paths/src/telemetry.ts` | (read) | Code | P3 |
| `research/archon/packages/cli/src/bundled-skill.ts` | (~150) | Code | P2 |
| `research/archon/CLAUDE.md` | ~1,000 | Reference | Read in full |
| `research/archon/Caddyfile.example` | (read) | Operational | P3 |
| `research/archon/Dockerfile.user.example` | (read) | Operational | P3 |
| `research/archon/.claude/skills/` | (directory) | Operational | P3 |

---

## 13. Closing notes

**The single biggest mine:** Archon's `dag-node.ts` + `worktree.ts` + `output-ref.ts` together are about 2,100 lines of production code that fill three of chimera's biggest gaps (declarative workflows, isolation, strict cross-node reads). A direct port would move chimera from "hypothetical parallel agent runtime" to "shippable product" with about 3 weeks of focused work.

**The single biggest non-mine:** Archon's platform-adapter layer (Slack/Telegram/Discord/GitHub/Web). chimera's TUI-first identity is its main differentiator; copying Archon's adapters would erase that.

**The one pattern Archon has that chimera is missing and probably needs most urgently:** the `trigger_rule` join semantics. chimera's quality gate is currently hard-coded; `trigger_rule: one_success` for the synthesize step would cut a round-trip on the happy path of the verify+challenge flow. This is a 5-line schema change with disproportionate impact.

**What I didn't dig into** (for follow-up research if useful):
- `archon-cli/src/commands/workflow.ts` — the CLI surface for running workflows; chimera's `chimera-cli/` has only 4 files (`cli-router.ts`, `config-loader.ts`, `eval-runner.ts`, `index.ts`); the workflow command pattern is rich.
- `archon/.claude/skills/` — 13 named skills (archon, archon-dev, manage-run, release, etc.). The skill-loader pattern is worth porting as a chimera "skill" concept, distinct from "command."
- `archon/packages/web/` — the React UI (Workflow Builder, Dashboard, Chat). Skip for now, but the WorkflowBuilderPage component is the closest existing reference for a future chimera "workflow authoring" surface.
- `archon/packages/docs-web/` — the docs site (Astro). Chimera has no docs site; the Astro + MDX + OpenAPI pattern is the right shape for a future docs site.
- The `archon-` prompt library (`.archon/commands/defaults/`) — 100s of named commands. Mostly Archon-specific, but the prompt-craft style is worth a skim.

— end of report
