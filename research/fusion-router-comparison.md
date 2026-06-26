# Chimera Fusion Mode vs OpenRouter Fusion Router — Comparison & Improvement Report

> Source: OpenRouter docs at `https://openrouter.ai/docs/guides/routing/routers/fusion-router`
> Chimera source: `chimera/packages/chimera-core/src/coordinator/fusion-executor.ts` (and the surrounding stack)

---

## TL;DR

OpenRouter's `openrouter/fusion` is a **production multi-model deliberation tool** with web-search-equipped panel + judge, structured analysis schema, cost/recursion guards, and config passthrough. Chimera's `FusionExecutor` is an **83-line stub** that does the rough shape of the same pipeline but is missing: routing/factory plumbing, the analysis schema, safety guards, cost control, judge failover, and a wired-up call site. The test file at `fusion-executor.test.ts:11` references a richer API (`{ eventStream, registry }`, `providerFactory`, `analysisModels`, `judgeModel`) that **does not match the implementation** — i.e. the team has a design in mind that hasn't landed.

The good news: most of the missing pieces (cost guard, event types, panel config) already exist elsewhere in chimera and just need to be threaded in. Below is the gap analysis and a concrete improvement plan.

---

## 1. OpenRouter Fusion Router — what's actually shipped

### Pipeline (5 steps, official)
1. Request sent with `model: "openrouter/fusion"`. Router resolves the alias to a real model and attaches the `openrouter:fusion` tool.
2. The outer model reads the prompt and decides whether to invoke `openrouter:fusion`. `tool_choice: "required"` forces invocation.
3. **Panel** — a set of models answers the prompt in parallel, each with `openrouter:web_search` and `openrouter:web_fetch` enabled.
4. **Judge** receives all panel responses (also with web tools). It does **not merge** — it returns a structured comparison: *consensus, contradictions, coverage gaps, unique insights, blind spots*.
5. The outer model receives the analysis and writes the final answer.

### Configuration (all optional, defaults = "Quality preset")
| Field | Default | Notes |
|---|---|---|
| `analysis_models` | `claude-opus`, `gpt-latest`, `gemini-pro-latest` | Panel. 1–8 models. |
| `model` | Outer model | Judge. |
| `max_tool_calls` | `8` | Per inner call. Range 1–16. |
| `max_completion_tokens` | Provider default | Caps reasoning-heavy models. |
| `reasoning` | Provider default | `{ effort, max_tokens }` forwarded. |
| `temperature` | Provider default | Forwarded to panel and judge. |

### Two usage modes
- **Model alias** (`openrouter/fusion`): tool auto-injected.
- **Server tool** (`tools: [{ type: "openrouter:fusion" }]`): explicit, composable with other tools.

### Cost & guards
- Cost ≈ **4–5×** a single completion at default 3-model panel; scales linearly.
- **Recursion protection** via `x-openrouter-fusion-depth` header — inner calls cannot re-invoke fusion. Single level of deliberation.
- Web search/fetch on **both** panel and judge.

### What the doc does NOT specify
The internal ranking/scoring algorithm is opaque — consensus/contradiction/insights/blind-spots is the output structure, not a scoring rubric. The decision to invoke fusion is delegated to the outer model.

---

## 2. Chimera's current FusionExecutor — what's there now

**File:** `chimera/packages/chimera-core/src/coordinator/fusion-executor.ts` (83 lines)

```ts
// pseudocode of the actual flow
const panelPromises = providers.map(p => p.complete([{ role: 'user', content: task }]));
const results = await Promise.allSettled(panelPromises);
const responses = results.map(r => maskContent(r.value.content, 500)); // 500-char cap

// judge = first successful provider (whatever that is)
const judge = providers[0];
const judgePrompt = `...Output MUST be valid JSON: {thought, final_response, consensus, conflicts}`;
const judgeResult = await judge.complete([{ role: 'user', content: judgePrompt }], { responseFormat: 'json_object' });
const parsed = JSON.parse(judgeResult.content);  // unguarded
return { output: parsed.final_response, consensus, conflicts, totalTokens };
```

### Concrete properties
- **EventStream** is wired in (`fusion_started`, `fusion_completed` events).
- `Promise.allSettled` — survives single-panel failure.
- Content masked at 500 chars before the judge sees it.
- Judge is hardcoded to `providers[0]` — no separate judge model selection, no failover.
- Judge output schema: `{thought, final_response, consensus: string[], conflicts: string[]}`.
- No temperature, no `max_completion_tokens`, no `max_tool_calls`, no `reasoning` config passthrough.
- No web search/fetch.
- No recursion protection.
- No budget/cost guard — does not call `CostTracker`.
- `JSON.parse` is unguarded — malformed judge output throws and the whole fusion fails.
- **Not exported** from `coordinator/index.ts` (see `chimera/packages/chimera-core/src/coordinator/index.ts:1-13`).
- **Not called from anywhere** in the live orchestrator (`SessionOrchestrator`, `CoordinatorEngine`, `AgentMesh` all reference different consensus systems — see §3).
- Emits `fusion_provider_error` event that **does not exist** in the Zod schema at `types/events.ts` — would throw at runtime when any panel member fails.

### What the test expects (and the codebase doesn't deliver)
`chimera/packages/chimera-core/src/coordinator/__tests__/fusion-executor.test.ts:11-26`:

```ts
const executor = new FusionExecutor({ eventStream, registry });
const config = { analysisModels: ['m1', 'm2', 'm3'], judgeModel: 'judge-m' };
const providerFactory = vi.fn().mockReturnValue(mockProvider);
await executor.execute('Research carbon taxes', config, providerFactory);
expect(providerFactory).toHaveBeenCalledTimes(4); // 3 panels + 1 judge
```

- Different constructor: takes `{ eventStream, registry }`, not just `eventStream`.
- Different `execute` signature: `(task, config, providerFactory)`, not `(task, providers)`.
- Implies a `ModelRegistry` (exists at `chimera/packages/chimera-providers/src/model-registry.ts`) and a `providerFactory` pattern that resolves `analysisModels` and `judgeModel` strings → `LLMProvider` instances.
- This is a **forward-looking design** that the implementation hasn't caught up to. The test will not compile against `fusion-executor.ts` as written.

---

## 3. Chimera actually has FIVE overlapping consensus systems

This is the most important architectural finding. The codebase is converging on "deliberation" from multiple directions:

| System | File | Line | Method | What it does |
|---|---|---|---|---|
| `FusionExecutor` | `coordinator/fusion-executor.ts` | 11 | Parallel panel + first-provider judge | "Fusion mode" — the one the question is about |
| `ResponseSynthesizer` | `response-synthesizer.ts` | 65 | Jaccard + `hasOppositeSentiment` + role authority | Multi-agent consensus for the quality gate (writer/reviewer/challenger/synthesizer) |
| `ResultAggregator` | `coordinator/result-aggregator.ts` | 31 | MERGE_PROMPT JSON merge of sub-task outputs | Sub-task result synthesis |
| `CoordinatorEngine` | `coordinator/coordinator-engine.ts` | 18 | Decompose → spawn → aggregate pipeline | Top-level orchestrator for complex tasks |
| `AgentMesh.executeQualityGate` | `agent-mesh.ts` | 39 | draft → verify → challenge → synthesize | The "duo/trio" mode in the type system |

The `OrchestrationPattern` type at `types/agent.ts:5` is `'duo' | 'trio' | 'fusion' | 'solo'` — so `'fusion'` is a first-class pattern in the type system, but the runtime is fragmented.

OpenRouter has one canonical pipeline. Chimera has five partial implementations of overlapping ideas.

---

## 4. Side-by-side comparison

| Dimension | OpenRouter Fusion | Chimera FusionExecutor | Chimera "fusion" target (per the test) |
|---|---|---|---|
| **Stage shape** | 5 steps: panel → judge → analysis → outer | 3 steps: panel → judge → output | Implies same 3-step shape with factory |
| **Panel size** | 1–8 models, configurable | Whatever `providers[]` is passed | `analysisModels: string[]` in config |
| **Judge selection** | `model` config (independent of panel) | Hardcoded to `providers[0]` | `judgeModel: string` in config |
| **Panel tools** | `web_search` + `web_fetch` enabled | None | None |
| **Judge tools** | `web_search` + `web_fetch` enabled | None | None |
| **Forced invocation** | `tool_choice: "required"` | None — the orchestrator must decide | Not yet designed |
| **Recursion guard** | `x-openrouter-fusion-depth` header | None | Not yet designed |
| **Output schema** | `consensus, contradictions, coverage gaps, unique insights, blind spots` (5 fields) | `thought, final_response, consensus, conflicts` (4 fields — no insights/blind-spots) | Not yet designed |
| **Reasoning passthrough** | `reasoning: { effort, max_tokens }` | None | Not yet designed |
| **Temperature** | Configurable, forwarded | None | Not yet designed |
| **Max tool calls** | `max_tool_calls` (1–16) | None — no tool loop | N/A |
| **Max completion tokens** | Configurable | None | Not yet designed |
| **Content compaction** | None — full responses to judge | 500-char mask before judge | Not yet designed |
| **Failure handling** | Tool call can fail and outer can retry | `Promise.allSettled` survives panel failures, but unguarded `JSON.parse` on judge kills the call | Not yet designed |
| **Cost guard** | Documented: 4–5× per request | `CostTracker` exists but is **not called** | Not yet designed |
| **Routing / provider resolution** | OpenRouter normalizes all panels | Caller passes raw `LLMProvider[]` | `providerFactory(modelName) => LLMProvider` (per the test) |
| **Configuration object** | `analysis_models`, `model`, `max_tool_calls`, `max_completion_tokens`, `reasoning`, `temperature` | None — parameters baked into the call | `analysisModels`, `judgeModel` (start of a config object) |
| **Event types** | N/A (server-side) | `fusion_started`, `fusion_provider_error`, `fusion_completed` — but the error type doesn't exist in the Zod schema | Not yet designed |

---

## 5. What's good about chimera's design direction

Not everything is a gap. Some of chimera's choices are arguably better than OpenRouter's defaults:

1. **Type-safe event stream.** The `EventStream` class (`event-stream.ts:1`) is genuinely good — replay, wildcard subscriptions, immutability. OpenRouter has nothing equivalent; the user just gets a JSON blob back.
2. **Promise.allSettled semantics.** The panel tolerates individual failures and emits an error event. OpenRouter's model-level errors just bubble.
3. **The provider-factory pattern in the test** is the right abstraction. OpenRouter hides the provider resolution; chimera's test design is explicit and testable.
4. **Per-orchestrator cost tracking.** `CostTracker` (`cost-tracker.ts:7`) with 50/80/95/100% alerts is more granular than OpenRouter's "expect 4–5×" advice.
5. **The `OrchestrationPattern` type system.** `'duo' | 'trio' | 'fusion' | 'solo'` is a clean way to express topology. OpenRouter has nothing comparable.
6. **Worktree isolation** (`agent/worktree-isolation.ts`, per the exports) means chimera can fuse code changes from multiple agents in parallel sandboxes — a feature OpenRouter's text-only model has no analog for.

---

## 6. Improvement plan — concrete, ordered by leverage

### 6.1 Unify the consensus systems (highest leverage)

The biggest win is collapsing `FusionExecutor`, `ResponseSynthesizer`, `ResultAggregator`, and `AgentMesh.executeQualityGate` behind a common `DeliberationEngine` interface. Each one is a variation on "ask N, synthesize 1, expose disagreements" — different parameterizations, not different systems.

```ts
// proposed
interface DeliberationEngine {
  run(input: {
    task: string;
    role: 'fusion' | 'duo' | 'trio' | 'merge';
    panel: string[];           // model ids or roles
    judge: string;              // model id or role
    config?: DeliberationConfig;
  }): Promise<DeliberationResult>;
}
```

Each existing system becomes a preset that calls into this engine. The `OrchestrationPattern` type stays as the public-facing topology selector, and a new `deliberation.ts` owns the actual panel→judge→analysis pipeline.

### 6.2 Align the implementation with the test (or rewrite the test)

Pick one. Either:

- **(A) Implement what the test expects.** Constructor takes `{ eventStream, registry }`. `execute(task, config, providerFactory)`. `config: { analysisModels: string[], judgeModel: string, temperature?, maxCompletionTokens?, maxToolCalls?, reasoning? }`. Resolve model ids through `ModelRegistry`, build a `providerFactory(modelId) => LLMProvider` closure, fan out to the panel, call the judge. This is the cleanest path because the test signature was clearly designed by someone who thought about the API.
- **(B) Rewrite the test** to match the current `(task, providers)` signature and add a TODO to migrate later. Cheaper, but leaves the design debt.

Recommendation: **(A)**. The factory pattern unlocks cost tracking, model selection, and registry-based capability checks in one move.

### 6.3 Add OpenRouter's missing safety controls

All of these are low-effort, high-value additions that match the test's config shape:

```ts
interface FusionConfig {
  analysisModels: string[];
  judgeModel: string;
  temperature?: number;          // forwarded to all inner calls
  maxCompletionTokens?: number;  // caps reasoning-heavy models
  maxToolCalls?: number;         // per inner call
  reasoning?: { effort?: 'low' | 'medium' | 'high'; maxTokens?: number };
  forceInvocation?: boolean;     // equivalent to tool_choice: "required"
  webSearch?: boolean;           // equivalent to OpenRouter's web tools
  webFetch?: boolean;
}
```

- **Recursion protection** is a one-liner: a `Set<string>` of active fusion task ids, or an `x-chimera-fusion-depth` request header equivalent threaded through `LLMProvider.complete`'s `options`.
- **Cost guard**: call `costTracker.recordSpend(panel[j].provider, ...)` after each panel call and after the judge. Throw `BudgetExceededError` if it trips a threshold. The `CostTracker` is already plumbed.
- **Judge failover**: try `judgeModel` first, fall back to `analysisModels[0]`, then to the cheapest available provider. OpenRouter doesn't do this either, but it's strictly better.
- **Guard the JSON parse**: wrap `JSON.parse(judgeResult.content)` in `try/catch` and fall back to "best-effort" mode where the judge response is treated as the final output.

### 6.4 Expand the analysis schema to match OpenRouter's 5 fields

Current: `{thought, final_response, consensus, conflicts}`. Add `unique_insights` and `blind_spots`. Reasoning to back this: consensus and conflicts describe *agreement*; insights and blind spots describe *information asymmetry* — the things only one model said, and the things no model said. These are the most decision-useful fields and they're what OpenRouter's doc explicitly highlights.

### 6.5 Remove the 500-char content mask

`fusion-executor.ts:18-21` truncates each panel response to 500 chars before the judge sees it. This is a silent information loss. Either:
- (a) pass full responses, but cap total judge input (e.g. 24k tokens) and document the cap;
- (b) keep the mask but raise it to 4–8k chars and surface the cap in the event stream.

Recommendation: **(a)** with a soft cap that warns at 80% and truncates with a `[truncated — see full response in event stream]` marker.

### 6.6 Define the missing event types in the Zod schema

`types/events.ts` does not define `fusion_provider_error`. Add:
- `fusion_provider_error`
- `fusion_judge_error`
- `fusion_recurision_blocked` (or similar)
- `fusion_config_invalid`

Otherwise the executor throws `ZodError` when emitting these events — which is a real bug, not a hypothetical.

### 6.7 Wire fusion into the orchestrator

`FusionExecutor` is currently orphaned. Add a deliberate entry point in `SessionOrchestrator` (e.g. `orchestrator.fuse(task, config)`) and a complexity-routing rule in `TaskRouter.classifyTask` that selects `'fusion'` orchestration when `overallComplexity > 0.75` AND the user has flagged "high-stakes" or "compare and contrast" intent. This is what OpenRouter means by "anything where the cost of being wrong outweighs the cost of a few extra completions."

### 6.8 Document the cost model in the same place

OpenRouter's "expect 4–5× per request, scales linearly" is the kind of operational reality that should be in chimera's docs. Add it to a `chimera-feature/chimera-agent-blueprint.md` section on fusion topology — alongside the model-tier table from `chimera-providers/src/model-registry.ts` so users can estimate cost before triggering a fusion.

### 6.9 Long-term: add a "consensus" preset distinct from "quality"

OpenRouter's presets are `consensus` (cluster + pick representatives) and `quality` (pick best single, optional refine). Chimera could expose both behind the same engine:
- `preset: 'consensus'` → current `FusionExecutor` shape (panel + judge + structured comparison).
- `preset: 'quality'` → smaller panel (2 models), judge picks the best, single-pass.

This gives users a fast/cheap path and a slow/expensive path through the same engine — the exact split that the `ComplexityScore` dimensions in `task-router.ts:32-50` are already designed to drive.

---

## 7. Open questions for the team

1. The test references `ModelRegistry` and `providerFactory`. Is the design intent to centralize provider construction in `chimera-providers`, or is this a stub? (`ModelRegistry` exists but I haven't traced a `providerFactory` symbol yet — worth confirming.)
2. The 500-char content mask — is that intentional (e.g. cost guard) or a leftover from a different design? It needs to be justified or removed.
3. Does fusion need to be reachable from `CoordinatorEngine.execute` (for tasks that decompose into a fusion), or only from `SessionOrchestrator` (top-level)? The wiring decision affects whether fusion inherits the sub-task dependency graph.
4. Should the judge see model identities (and use role/capability context) or remain anonymous? OpenRouter preserves the model in the response metadata; chimera currently anonymizes everything. The choice changes how the judge prompt is written.

---

## 8. Recommendation summary

| Priority | Action | Effort | Impact |
|---|---|---|---|
| P0 | Align `FusionExecutor` constructor + `execute` with the test signature | S | Unblocks the test and starts the migration |
| P0 | Add missing event types to `types/events.ts` | XS | Fixes a runtime bug |
| P0 | Guard `JSON.parse` of judge output | XS | Fixes a total-failure mode |
| P1 | Add `FusionConfig` with `temperature`, `maxCompletionTokens`, `maxToolCalls`, `reasoning` | S | Parity with OpenRouter knobs |
| P1 | Wire fusion into `SessionOrchestrator` and `TaskRouter` complexity routing | M | Makes the feature reachable |
| P1 | Call `CostTracker.recordSpend` for each panel + judge | XS | Closes the cost-guard gap |
| P2 | Add `unique_insights` and `blind_spots` to the analysis schema | S | Higher-quality deliberation output |
| P2 | Recursion protection (depth header or task id set) | S | Prevents infinite fan-out |
| P2 | Judge failover (judge → panel[0] → cheapest) | S | Better availability |
| P3 | Unify the 5 consensus systems behind a `DeliberationEngine` | L | Architectural cleanup |
| P3 | Add `consensus` vs `quality` presets | M | Matches OpenRouter's design space |
| P3 | Replace 500-char mask with soft cap | S | Information fidelity |

---

*Report generated from primary source: `https://openrouter.ai/docs/guides/routing/routers/fusion-router` and direct reads of `chimera/packages/chimera-core/src/coordinator/fusion-executor.ts`, `coordinator/result-aggregator.ts`, `coordinator/coordinator-engine.ts`, `coordinator/types.ts`, `coordinator/__tests__/fusion-executor.test.ts`, `response-synthesizer.ts`, `agent-mesh.ts`, `task-router.ts`, `cost-tracker.ts`, `event-stream.ts`, `index.ts`, `types/agent.ts`, `types/events.ts`, `types/router.ts`, and `chimera/packages/chimera-providers/src/model-registry.ts`.*
