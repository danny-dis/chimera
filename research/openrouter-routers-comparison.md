# OpenRouter Routing Modes — Comparison With Chimera's TaskRouter

> Source: OpenRouter docs at `https://openrouter.ai/docs/guides/routing/*` and the OpenRouter blog.
> Chimera source: `chimera/packages/chimera-core/src/task-router.ts` and the surrounding stack
> (Fusion Router comparison: `research/fusion-router-comparison.md`).
>
> All `path:line` references point to files in `C:\Users\pc\Documents\projects\chimera`.

---

## TL;DR

OpenRouter's "routing" is not four discrete products — it is a **stack of orthogonal features** that compose:

1. **Slug presets** — `:floor`, `:nitro`, `:bf16`, `:free` appended to any model id.
2. **`openrouter/auto`** — NotDiamond-powered per-prompt model selection with a `cost_quality_tradeoff` dial (0–10, default 7).
3. **`openrouter/nitro`** — LLM-based prompt analyzer (an inner Claude Sonnet) that picks the best target model per request.
4. **`openrouter/fusion`** — Multi-model deliberation with a panel + judge (covered in the prior report).
5. **Model fallbacks** — a `models` array; try them in order, fail over on classified errors.
6. **Provider routing** — `provider` object: `order`, `only`, `ignore`, `sort`, `max_price`, `preferred_max_latency`, `preferred_min_throughput`, `quantizations`, `zdr`, `data_collection`.
7. **`~author/family-latest`** — auto-upgrade aliases (`~anthropic/claude-opus-latest` → newest visible Opus).
8. **Body Builder** — an LLM (`openrouter/bodybuilder`) that takes natural language and emits a parallel set of request bodies.
9. **Auto Exacto** — quality-tiered provider routing for tool calls (default on, no knob).

Chimera's `TaskRouter` (`task-router.ts:11`) is a **keyword-scoring classifier** that picks one of four `Mode` values (`'ask' | 'plan' | 'code' | 'debug'` at `types/agent.ts:3`) and emits a single `task_classified` event. It has no notion of:
- per-prompt LLM-based model selection,
- cost-vs-quality as a continuous dial,
- provider failover chains,
- a `models` fallback list,
- a stable alias that tracks the newest version of a family.

The biggest single borrowable idea is **the `cost_quality_tradeoff` 0–10 dial inside Auto Router** — chimera has the underlying complexity signal (`task-router.ts:32-50`'s 15-dimension `ComplexityScore`) but no continuous knob to express "I am willing to spend more for higher-quality work on this task." Everything else maps to specific feature gaps in the orchestration/coordination layer.

---

## 1. OpenRouter's routing surface

### 1.1 Per-router summary

#### A. Slug presets (`:floor`, `:nitro`, `:bf16`, `:free`)

| Preset | Behavior | Equivalent in `provider` object |
|---|---|---|
| `:floor` | Routes to the **cheapest** provider for the model. Disables load balancing. | `provider.sort: "price"` |
| `:nitro` | Routes to the **fastest** provider for the model. | `provider.sort: "throughput"` |
| `:bf16` | Routes to a `bf16` quantized provider (when available). | `provider.quantizations: ["bf16"]` |
| `:free` | Free models only. | `provider.max_price: { prompt: 0, completion: 0 }` |

Source: [OpenRouter blog — How to Get the Lowest-Cost LLM Inference on OpenRouter](https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter).

**Algorithm:** Pure string-parse → provider-sort. No LLM involved. Caller-side zero-cost, server-side cost is the underlying model's price. Article's caveat: ":floor disables load balancing and locks onto the cheapest endpoint, which may not be the most reliable on a given day."

**Cost model:** Passed-through. No surcharge for the preset itself.

**Unique feature:** The slug syntax means any consumer can opt-in by appending a colon to a model id — no schema change, no SDK update, no separate feature flag.

---

#### B. Auto Router (`openrouter/auto` + `plugins[].id: "auto-router"`)

Source: [OpenRouter Auto Router docs](https://openrouter.ai/docs/guides/routing/routers/auto-router).

**Algorithm:** Powered by [NotDiamond](https://www.notdiamond.ai/). 4-step flow per request:

1. Prompt analysis (NotDiamond router looks at the prompt)
2. Model selection from a curated pool
3. Request forwarded to the selected model
4. Response includes `model` field showing which model actually answered

Curated pool (as of Dec 2025): Claude Sonnet 4.5, Claude Opus 4.5, GPT-5.1, Gemini 3.1 Pro, DeepSeek 3.2, "and other top-performing models."

**Configuration parameters:**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `model` | string | `"openrouter/auto"` | Required; aliases to the router |
| `session_id` | string | — | Explicit stickiness; pin to a model/provider for the conversation |
| `plugins[].id` | string | `"auto-router"` | Activates plugin config |
| `plugins[].cost_quality_tradeoff` | integer 0–10 | `7` | `0` = pure quality, `10` = pure cost |
| `plugins[].allowed_models` | string[] | — | Wildcard patterns (`anthropic/*`, `openai/gpt-5*`, `google/*`, `*/claude-*`) |

**Session stickiness — two flavors:**

- **Implicit (automatic):** OpenRouter derives a fingerprint from the first system + first user message. Activates after the provider reports prompt-cache usage.
- **Explicit:** `session_id` is honored on the first successful response (even before cache usage is reported).
- Cache expires after 5 minutes of inactivity; each successful request resets the timer.
- If the cached provider errors, the cache is **not** updated — next request re-routes.

**Cost model:** "Pay the standard rate for whichever model is selected. There is no additional fee for using the Auto Router." Failed requests are not billed ("zero-completion insurance").

**Unique features:**

- **Per-prompt model selection** that survives multi-turn conversations via session stickiness.
- **The `cost_quality_tradeoff` 0–10 dial** is a continuous knob the caller controls per request. (Most "router" products give you a categorical choice: quality / cost / balanced. OpenRouter gives you a real number.)
- **Pinning distinction:** "Unlike using a fixed model, the Auto Router selects a different model each time based on your prompt. Session stickiness is especially important here because it also pins the **model selection** — not just the provider."

---

#### C. "Intelligence Route" — what chimera's task author may have meant

**There is no OpenRouter product named "Intelligence Route."** A search of the docs and blog turned up no such feature. The closest mappings are three things, and the right one to model in chimera is a combination of them:

1. **`openrouter/nitro`** — an LLM-based prompt analyzer. According to one of the few public references, "openrouter/nitro uses a larger model (currently `anthropic/claude-sonnet-4.5`) to analyze the incoming prompt and intelligently route it to the most appropriate underlying model." Each request goes through an LLM before being routed, so there is an extra cost and latency overhead. The router charges **$0.85/M input + $3.40/M output tokens** for the analysis step. (Note: this is a per-token surcharge on top of whatever model is ultimately selected.)
2. **`openrouter/auto`** — NotDiamond's ML classifier (above). Per-prompt selection from a pool, but the classifier itself is a small ML model — not a separate LLM call.
3. **`cost_quality_tradeoff` parameter** — the "intelligence" knob. When set near 0, you get the strongest model in the pool. The tradeoff is encoded as a number, not a category.

If "the Intelligence Route has a known concept" is the prompt author's hint, the **known concept** is the **`cost_quality_tradeoff` dial** — the idea that "intelligence" is a continuous variable the caller trades against cost. That is the genuinely novel idea. The `openrouter/nitro` flavor of "intelligence" (LLM-based classifier) is just one implementation of it; NotDiamond is another.

**Algorithm (the `cost_quality_tradeoff` reading):**

```
target = classify(prompt)            // per-prompt model candidate set
ranking = score(targets, tradeoff)   // 0 = always pick the best, 10 = always pick the cheapest
return ranking[0]
```

**Cost model:** Same as Auto Router — pay the standard rate of the model that gets selected. No surcharge on the dial itself.

**Unique features:**

- A **single, real-valued knob** that maps a continuous user intent ("I care about quality" / "I care about cost" / "I care about both") to a continuous model selection.
- The knob is **per-request** — the caller can vary it within a session, the router re-classifies.
- It composes with `allowed_models` patterns, so you can say "give me the cheapest GPT-5 family model" (`cost_quality_tradeoff: 10, allowed_models: ["openai/gpt-5*"]`).

**If "Intelligence Route" means `openrouter/nitro` specifically**, the unique feature is **an LLM in the routing loop** — making routing decisions in language, not via a small classifier. This is heavy, slow, and costs $0.85/M in. The benefit is reasoning about unusual prompts the small classifier might miss.

---

#### D. Fusion Router — `openrouter/fusion`

Covered in detail in `research/fusion-router-comparison.md`. Quick recap for the table:

- 5-step pipeline: outer model reads prompt → `tool_choice: "required"` forces invocation → 1–8 panel models answer in parallel with web tools → judge (with web tools) returns structured analysis → outer writes final answer.
- Config: `analysis_models`, `model` (judge), `max_tool_calls`, `max_completion_tokens`, `reasoning`, `temperature`.
- Recursion guard: `x-openrouter-fusion-depth` header.
- Cost: ~4–5× per request at default panel of 3.
- Source: [OpenRouter Fusion Router docs](https://openrouter.ai/docs/guides/routing/routers/fusion-router).

---

### 1.2 Adjacent features that surface alongside the routers

#### E. Model fallbacks (`models` array)

Source: [OpenRouter Model Fallbacks docs](https://openrouter.ai/docs/guides/routing/model-fallbacks).

**Algorithm:** Sequential. Try primary → on classified error → try next → exhaust list. Triggers: context length, moderation, rate-limit (429), downtime (5xx/timeout). **Non-error refusals (200 with garbage) do not trigger fallback.**

**Configuration:**

- **`models`** (string[]) — priority-ordered list; max 3 entries via Anthropic Messages API (`fallbacks`); up to N via chat completions.
- **`fallbacks`** (Anthropic Messages API only) — equivalent; mutually exclusive with `models`.
- `extra_body` for OpenAI SDK.
- Cannot combine `fallbacks` and `models` (400 error).

**Cost:** Priced by the model that ultimately used. `model` field in response shows which one ran.

**Unique features:**

- The list is **explicitly ordered** — no inverse-square pricing, no NotDiamond. The caller is in full control.
- The fallback trigger set is **narrowly defined** — fallback only fires on classified errors, not on low-quality 200 responses. This is the right behavior; the doc calls it out.
- `models: ["~anthropic/claude-sonnet-latest", "gryphe/mythomax-l2-13b"]` — `~` prefix means the primary uses the latest-version alias, and if it fails we drop to a specific 13B model. (Combines Latest Model Resolution with Model Fallbacks in one request.)

---

#### F. Provider routing (`provider` object)

Source: [OpenRouter Provider Routing docs](https://openrouter.ai/docs/guides/routing/provider-selection).

**Algorithm:** Two stages.

1. Filter providers by `order` / `only` / `ignore` / `require_parameters` / `quantizations` / `data_collection` / `zdr` / `max_price`.
2. Sort the remaining set per `sort` (`"price"`, `"throughput"`, or `"latency"`), with the **default** being:
   - Deprioritize providers with significant outages in the last 30 seconds (not removed)
   - Among stable, weight selection by the **inverse square of the price**
   - Remaining providers serve as fallbacks

Worked example from the docs: providers at $1/$2/$3 with Provider B having recent outages → Provider A is "9× more likely than C" (1/3²).

**Configuration parameters (all in `provider`):**

| Field | Default | Purpose |
|---|---|---|
| `order` | — | Prioritized provider list (hard constraint if `allow_fallbacks: false`) |
| `allow_fallbacks` | `true` | Allow backup providers when chosen ones fail |
| `require_parameters` | `false` | Only providers supporting all request params |
| `data_collection` | `"allow"` | Filter by data policy |
| `zdr` | — | Zero Data Retention only |
| `enforce_distillable_text` | — | Only distillable models |
| `only` | — | Allowlist |
| `ignore` | — | Blocklist |
| `quantizations` | — | `int4`, `int8`, `fp4`, `fp6`, `fp8`, `fp16`, `bf16`, `fp32`, `unknown` |
| `sort` | inverse-square-of-price | `"price"` / `"throughput"` / `"latency"`, or object form `{ by, partition }` |
| `preferred_min_throughput` | — | Min tokens/sec at p50/p75/p90/p99 |
| `preferred_max_latency` | — | Max seconds at p50/p75/p90/p99 |
| `max_price` | — | Cap per million tokens (prompt / completion / request / image) |

**`sort` object form:**

- `by`: `"price"` / `"throughput"` / `"latency"`
- `partition`: `"model"` (default — group by model before sorting) or `"none"` (global sort across model fallbacks)

The `partition: "none"` setting is the under-appreciated feature: it lets routing **cross model boundaries** to satisfy a single objective, which is how BYOK and price-sorted fallback sets work.

**Performance threshold behavior:**

- Metrics are calculated over a **rolling 5-minute window**.
- Endpoints that don't meet the threshold are **deprioritized (moved to the end)** rather than excluded.
- "`preferred_max_latency` and `preferred_min_throughput` do *not* guarantee you will get a provider or model with this performance level. However, providers and models that hit your thresholds will be preferred."

**Cost model:** Pass-through. Pricing, context length, modalities, and supported parameters all reflect the concrete model that was routed to.

**Unique features:**

- **Inverse-square price weighting** as the default. Aggressive: a 3× price difference = 9× weight difference. This pushes traffic to the cheapest reliable providers in a controlled way.
- **`max_price` is a hard cap** (request fails if all providers exceed it); `preferred_*` thresholds are **soft preferences** (request never fails due to them).
- **Per-endpoint targeting** — `google-vertex/us-east5` vs the generic `google-vertex` for region pinning.
- **Auto-managed headers** — prompt caching, extended context, structured outputs, fine-grained tool streaming (`eager_input_streaming: true`) are auto-handled by OpenRouter.
- **Auto Exacto** for tool calls — providers are tiered by tool-call quality signals, then price-sorted within tier.

---

#### G. Latest Model Resolution (`~author/family-latest`)

Source: [OpenRouter Latest Model Resolution docs](https://openrouter.ai/docs/guides/routing/routers/latest-resolution).

**Algorithm:**

1. Recognize the `~` prefix in the `model` slug
2. Select the **newest visible model** in the family
3. Forward the request
4. Return the concrete slug in the response's `model` field

**Decision criteria:** "newest visible" per family. "Aliases and hidden models are excluded." Returns an error rather than falling back if no eligible model exists.

**Configuration:** Just use a `~author/family-latest` slug in `model`.

**Cost model:** "Cost dashboards reflect the real rate charged, because requests are billed at the concrete model's price." Fields refresh automatically when a new model is promoted to "latest."

**Unique features:**

- **Zero-downtime version upgrades** — pin to a stable alias and inherit new releases with no client change.
- **No silent downgrade** — returns an error rather than resolving to a different family.
- **Self-reporting version** — the response `model` field always tells you the concrete version that served.
- **No pin to "second newest" or rollback via alias** — downgrading requires switching to a concrete slug.

---

#### H. Body Builder (`openrouter/bodybuilder`)

Source: [OpenRouter Body Builder docs](https://openrouter.ai/docs/guides/routing/routers/body-builder).

**Algorithm:** This is **not a runtime router** — it is an LLM (a model you call) that **generates** a parallel set of request bodies. The caller then executes them in parallel (`Promise.all` / `asyncio.gather`). There is no scoring, no fallback, no aggregation.

**Input:** Natural-language description of the models to call. Example: `"Count to 10 using Claude Sonnet and GPT-5"`.

**Output:**

```json
{
  "requests": [
    {"model": "anthropic/claude-sonnet-4.5", "messages": [...]},
    {"model": "openai/gpt-5.1", "messages": [...]}
  ]
}
```

**Alias resolution** (current as of Dec 4, 2025):

- "Claude Sonnet" → `anthropic/claude-sonnet-4.5`
- "Claude Opus" → `anthropic/claude-opus-4.5`
- "GPT-5" → `openai/gpt-5.1`
- "Gemini" → `google/gemini-3.1-pro-preview`
- "DeepSeek" → `deepseek/deepseek-v3.2`

**Cost model:** Body Builder generation is **free**. Executing the generated requests uses standard model pricing.

**Unique features:**

- **Free NL → multi-model request generation.**
- **Alias-to-slug resolution** — "Claude" → the right concrete slug, with the model pool updating as new versions ship.
- **Build-time, not runtime** — this is for benchmarking, A/B testing, exploration, and redundancy patterns. The caller owns the aggregation.

---

## 2. Comparison: OpenRouter routers vs chimera's `TaskRouter`

| Dimension | OpenRouter Auto Router | OpenRouter `:floor` / Cost-Optimized | OpenRouter "Intelligence" (nitro / tradeoff) | OpenRouter Fusion | Chimera `TaskRouter` |
|---|---|---|---|---|---|
| **Location** | `docs/guides/routing/routers/auto-router` | Blog + `provider.sort: "price"` / `max_price` | `cost_quality_tradeoff` parameter (0–10) | `docs/guides/routing/routers/fusion-router` | `task-router.ts:11` |
| **Algorithm** | NotDiamond ML classifier per prompt | Inverse-square price weighting on filtered providers | Per-prompt classifier + LLM analyzer (nitro); continuous dial (tradeoff) | 1–8 panel + judge + analysis schema | Keyword scoring over 15 dimensions (`task-router.ts:32-50`) |
| **Output cardinality** | One model per request | One provider per request | One model per request | Multi-model synthesis (panel + judge) | One `Mode` per request |
| **Caller controls** | `session_id`, `allowed_models`, `cost_quality_tradeoff` | `max_price`, `quantizations`, `ignore`, `only` | `cost_quality_tradeoff` (0–10) | `analysis_models`, `model` (judge), `max_tool_calls`, `max_completion_tokens`, `reasoning`, `temperature` | `providers` (list passed in) |
| **Session stickiness** | Yes — implicit (fingerprint) or explicit (`session_id`) | No | No | No (each call is independent) | No |
| **Multi-model output** | No — picks one | No | No | Yes — panel + judge | No |
| **Cost model** | Standard rate of selected model | Standard rate of selected provider | Standard rate + $0.85/M in, $3.40/M out for nitro LLM step | ~4–5× single completion at default panel | None — just emits `estimatedCost: complexity * 5` (`task-router.ts:82-84`) |
| **Cost guard** | No (you pay the model rate) | `max_price` is a hard cap | Same as Auto Router | Documented "expect 4–5×"; no programmatic guard | None — `CostTracker` exists (`cost-tracker.ts:7`) but is not called |
| **Failure semantics** | Session cache not updated on error | Provider failover; not removed from pool | Same as Auto Router | Tool call failure; outer retries | N/A — TaskRouter just classifies |
| **Output type** | The model that answered | The provider that served | The model that answered | Structured: `consensus`, `contradictions`, `coverage gaps`, `unique insights`, `blind spots` | `ClassificationResult` with `score`, `recommendedMode`, `reasoning` (`task-router.ts:24-28`) |
| **Latency cost** | Per-prompt classifier | None (slug suffix) | Extra LLM call (nitro) | 2–3 sequential LLM calls + panel | None — synchronous scoring |
| **Configuration shape** | Per-request `plugins[].id` array | Per-request `provider` object | Per-request `plugins[].cost_quality_tradeoff` | `tools: [{ type: "openrouter:fusion" }]` or `model: "openrouter/fusion"` | `setProviders(providers)` then `classifyTask(task)` |
| **Telemetry** | Response `model` field exposes actual model | Response `model` field exposes actual provider | Response `model` field exposes actual model | Response metadata | `task_classified`, `task_decomposed` events on the `EventStream` (`task-router.ts:61-66`, `131-135`) |
| **Capability check** | `require_parameters` + `quantizations` | Same | Same | Per-tool model | Per-provider `AgentConfig.constraints` (`types/agent.ts:31-38`) |
| **Fallback chain** | Provider failover (default) | Provider failover | Provider failover | Outer model retries | None — `selectProvider` returns first match (`task-router.ts:86-98`) |

### 2.1 What OpenRouter has that chimera doesn't

1. **A continuous `cost_quality_tradeoff` dial.** Chimera has 15 binary keyword dimensions (`task-router.ts:5-9` are the keyword lists; `:32-50` are the dimensions) collapsed to one `overall` number, which then picks a discrete `Mode` (`:54-57`). The OpenRouter equivalent is a single number 0–10 that the caller sets per request. Chimera's `overall` score is computed internally; the user can override `Mode` but cannot express "I want this task to be cheap but high-quality."
2. **Per-prompt model selection.** OpenRouter's routers select the *model* (and provider) for every request based on the prompt. Chimera's `TaskRouter` selects a `Mode` (`'ask' | 'plan' | 'code' | 'debug'`) and the agent system then picks a `role` (`'writer' | 'reviewer' | 'challenger' | 'synthesizer' | ...`, `types/agent.ts:1`) — but the *model* is bound to each `AgentConfig` at registration (`types/agent.ts:26-39`). There is no path from "the user said 'refactor this in detail'" to "use a different model for this specific turn."
3. **`models` array fallback chain.** Chimera has `selectProvider` returning a single `AgentConfig` (`task-router.ts:86-98`). There is no concept of "try this provider, then this one, then this one" — and no concept of "swap to a different model" if the first one errors.
4. **`~author/family-latest` auto-upgrade.** Chimera pins model slugs in `AgentConfig` (`types/agent.ts:29`) — there is no alias resolution layer.
5. **Provider-only routing knobs.** `max_price`, `quantizations`, `zdr`, `data_collection`, `preferred_min_throughput`, `preferred_max_latency`, `partition: "none"` for cross-model sorting — none exist in chimera.
6. **Inverse-square price weighting as a default load-balancing strategy.** Chimera's `selectProvider` sorts by `modelTier` (`task-router.ts:90-94`) and returns the cheapest by tier — not by inverse-square-of-price.
7. **Zero-completion insurance.** Failed requests are not billed. Chimera's `CostTracker` would need a similar "don't bill for throws" semantic; the existing code in `cost-tracker.ts:7` was not read in this round but the existing fusion report notes it is not called from `FusionExecutor` (`fusion-executor.ts:39-58`).
8. **`openrouter/nitro` — an LLM in the routing loop.** This is a heavy, slow, and expensive idea (one extra LLM call per request) but it makes routing decisions in *language*, which the small ML classifier in Auto Router cannot. Chimera's `TaskRouter` is keyword-only; a future "intelligent" mode could be a small LLM call that takes the task and returns `cost_quality_tradeoff`, `panel_size`, `topology`, etc.
9. **Body Builder pattern — natural-language request generation.** This is a build-time helper, not a router per se, but it's the only OpenRouter feature that lets a developer say "ask Claude and GPT-5 the same thing" without writing the request array themselves. Chimera's `CoordinatorEngine.decomposeTask` (`task-router.ts:109-138`) does the opposite: it splits one task into subtasks, not multiplies one task across models.

### 2.2 What chimera has that OpenRouter doesn't

1. **`OrchestrationPattern` type** at `types/agent.ts:5` — `'duo' | 'trio' | 'fusion' | 'solo'`. OpenRouter has no equivalent taxonomy. The closest is Fusion vs not-Fusion; there is no first-class notion of "trio = planner + executor + critic" vs "duo = writer + reviewer."
2. **15-dimension `ComplexityScore`** at `types/router.ts:1-20`. OpenRouter's routers treat prompts as opaque strings; chimera scores 15 distinct dimensions (code volume, architectural depth, dependency complexity, test coverage, security sensitivity, domain novelty, error handling, concurrency, external integrations, data transformation, state management, algorithmic complexity, API design, refactoring scope, cross-cutting concerns). This is genuinely richer than anything OpenRouter exposes — a router that can read these dimensions can make decisions that a per-prompt classifier literally cannot.
3. **Type-safe `EventStream`** at `event-stream.ts:8-56` with replay, wildcard subscriptions, and immutability. OpenRouter returns a JSON response; there is no event stream abstraction.
4. **Worktree isolation** for agents (per the existing fusion report — `agent/worktree-isolation.ts` is exported). OpenRouter is text-only; chimera can fuse code changes from multiple agents in parallel sandboxes.
5. **`decomposeTask` with a DAG** at `task-router.ts:109-138`. OpenRouter's routers do not produce sub-tasks. The DAG output is a real dependency graph, not just a sequential fallback list.
6. **`CostTracker` with 50/80/95/100% alerts** (per the fusion report). OpenRouter's `max_price` is a single hard cap; chimera could expose tiered alerts on the same underlying cost.
7. **Per-`AgentConfig` `constraints`** at `types/agent.ts:31-38` — `maxTokensPerTurn`, `costCapPerTask`, `costCapPerSession`, `costCapPerDay`, `maxParallelInstances`, `rateLimitRpm`. OpenRouter's `max_price` is per-request; chimera's constraints are per-agent across time.
8. **Role authority + sentiment analysis** in `ResponseSynthesizer` (per the fusion report) — OpenRouter's judge is a single LLM call; chimera's consensus is a structured algorithm with named roles.

### 2.3 How OpenRouter's routers map onto chimera's `OrchestrationPattern`

| `OrchestrationPattern` | OpenRouter equivalent | Notes |
|---|---|---|
| `'solo'` | `:floor` (cheapest provider) or `:nitro` (fastest provider) for the single agent | Pick a single provider based on cost/throughput dial |
| `'duo'` | Body Builder (2 panels) + LLM judge | Natural mapping — generate two parallel request bodies, judge picks |
| `'trio'` | Auto Router with `cost_quality_tradeoff: 0` (best of breed) OR Body Builder (3 panels) + judge | Either use NotDiamond-class for picking the best of N, or build 3 panels explicitly |
| `'fusion'` | `openrouter/fusion` (the existing comparison target) | Direct match — 1–8 panels + judge + analysis schema |

The `'solo'` mapping is the most under-exploited. Chimera could expose a per-task `costQualityDial: 0–10` that:
- at 0–2 selects the best `AgentConfig` (highest tier) and uses `costCapPerTask` generously;
- at 5 uses the default scoring from `task-router.ts:71-80`;
- at 8–10 selects the cheapest `AgentConfig` and tightens `costCapPerTask`.

The dim score from `task-router.ts:34-50` could be the *input* to the dial, not the dial itself. The user overrides; the system respects.

---

## 3. Borrowable ideas

### 3.1 Adopt the `cost_quality_tradeoff` 0–10 dial (highest leverage)

**What:** Add a continuous dial to chimera's `TaskRouter.classifyTask` (`task-router.ts:32-69`) that the caller passes in. Output: not just a `Mode` (`'ask' | 'plan' | 'code' | 'debug'`) but a per-request `complexity: { overall, dimensions }` *plus* a `qualityBudget: 0–10` that the downstream `selectProvider` (`task-router.ts:86-98`) reads.

**Why:** Chimera has the underlying complexity signal (15 dimensions) but no way for the user to express "I care about quality on this task" vs "I care about cost." The keyword dimensions are computed but not user-controllable.

**Mapping to `OrchestrationPattern`:**

- `dial ≤ 2` → `'fusion'` if `overall > 0.75` else `'trio'`
- `dial 3–6` → `'duo'`
- `dial ≥ 7` → `'solo'`

**Effort:** S. Add a `costQualityDial?: number` parameter to `classifyTask`; update `selectProvider` to read it; thread through the `task_classified` event (`task-router.ts:61-66`).

**Source:** [OpenRouter Auto Router docs](https://openrouter.ai/docs/guides/routing/routers/auto-router).

---

### 3.2 Add a `models: AgentConfig[]` fallback chain

**What:** Change `TaskRouter.setProviders` (`task-router.ts:16-18`) and `selectProvider` (`task-router.ts:86-98`) to accept an *ordered* list of `AgentConfig` per role. `selectProvider` returns the first; on classified error (mirroring OpenRouter's fallback triggers at [Model Fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks): context length, moderation, rate-limit, downtime), it tries the next.

**Why:** Chimera has no fallback semantics. `selectProvider` returns first match. A `models: [...]` array is the simplest, most explicit version of the same idea OpenRouter uses.

**Mapping to `OrchestrationPattern`:** Applies to all of them — the fallback chain is orthogonal to topology.

**Effort:** S. Mostly a signature change; the `EventStream` already supports emitting `provider_failed` events.

**Source:** [OpenRouter Model Fallbacks docs](https://openrouter.ai/docs/guides/routing/model-fallbacks).

---

### 3.3 Add a `~author/family-latest` alias resolver

**What:** Add an `AliasResolver` (or extend `ModelRegistry` at `chimera/packages/chimera-providers/src/model-registry.ts`) that takes a `~family-latest` slug and returns the newest model in the family. `AgentConfig.model` (`types/agent.ts:29`) accepts either a concrete slug or a `~` alias; resolution happens at provider construction time.

**Why:** Chimera pins concrete slugs. When a provider ships a new model version, chimera has to ship a code change. OpenRouter's `~` aliases decouple the two lifecycles.

**Mapping to `OrchestrationPattern`:** Applies to all of them.

**Effort:** M. Requires either an `AliasResolver` interface or a way to detect "newest model" from the `ModelRegistry`. The model registry has 2011 symbols per the index, so the surface exists.

**Source:** [OpenRouter Latest Model Resolution docs](https://openrouter.ai/docs/guides/routing/routers/latest-resolution).

---

### 3.4 Add a `max_price` + `preferred_min_throughput` per-`AgentConfig`

**What:** Extend `AgentConfig.constraints` (`types/agent.ts:31-38`) with optional `maxPricePerMToken?: { prompt?: number; completion?: number }` and `preferredMinThroughputTps?: number`. `selectProvider` filters by these.

**Why:** OpenRouter's `max_price` is a hard cap (request fails if all providers exceed it). Chimera's `costCapPerTask` is per-agent; this would be per-token, which catches cheap requests on expensive models.

**Mapping to `OrchestrationPattern`:** Applies to all.

**Effort:** XS. The fields are straightforward.

**Source:** [OpenRouter Provider Routing docs](https://openrouter.ai/docs/guides/routing/provider-selection).

---

### 3.5 Add a "Body Builder" mode for the `decomposeTask` pipeline

**What:** Add a `multiplyTask(task: string, modelAliases: string[]): { requests: AgentConfig[] }` to `TaskRouter` that returns N parallel `AgentConfig`s for a single task. Distinct from `decomposeTask` (`task-router.ts:109-138`) which splits one task into N subtasks.

**Why:** `decomposeTask` answers "how do I break this work up?" Body Builder would answer "how do I get N independent answers to the same work?" — the precursor to `'duo'` and `'trio'` patterns.

**Mapping to `OrchestrationPattern`:** This is the *generator* for `'duo'` and `'trio'` — `multiplyTask` produces the request set, then `ResponseSynthesizer` (or `FusionExecutor`) does the synthesis.

**Effort:** M. Mostly a new method plus alias resolution (ties to §3.3).

**Source:** [OpenRouter Body Builder docs](https://openrouter.ai/docs/guides/routing/routers/body-builder).

---

### 3.6 Add a `cost_quality_tradeoff` event to the `EventStream`

**What:** When the caller sets a `costQualityDial`, emit a `task_routed` event (in addition to `task_classified` at `task-router.ts:61-66`) with the chosen `OrchestrationPattern`, the `cost_quality_tradeoff` value, and the per-dimension `ComplexityScore` that drove the decision. Subscribers can replay and see "this task was routed to `'trio'` because `overall=0.62` and `cost_quality_tradeoff=3`."

**Why:** OpenRouter exposes the actual model that served in the response `model` field. Chimera's `EventStream` already has the right shape — just needs the right event type and a new field in the existing `task_classified` event.

**Mapping to `OrchestrationPattern`:** All — event is topology-agnostic.

**Effort:** XS.

**Source:** [OpenRouter Auto Router docs](https://openrouter.ai/docs/guides/routing/routers/auto-router).

---

### 3.7 Adopt "zero-completion insurance" semantics in `CostTracker`

**What:** Per the existing fusion report, `CostTracker` (`cost-tracker.ts:7`) is not called from `FusionExecutor` (`fusion-executor.ts:39-58`). Add the rule: "If the inner call throws, do not record spend." This mirrors OpenRouter's "you pay only for the run that completes."

**Why:** This is a user-experience improvement, not a technical fix. Users expect "I didn't get a result, I shouldn't be billed." Currently the architecture doesn't guarantee that.

**Mapping to `OrchestrationPattern`:** All — cost semantics should be uniform.

**Effort:** XS.

**Source:** [OpenRouter blog — Model Routing](https://openrouter.ai/blog/insights/model-routing).

---

### 3.8 Add an `nitro`-style "LLM in the routing loop" for very high-stakes tasks

**What:** For tasks where `overall > 0.85` *and* `cost_quality_tradeoff ≤ 2` *and* the user has opted in, take one extra LLM call to refine the `OrchestrationPattern` decision: e.g. "should this be `'fusion'` with 4 panels or 6 panels?" The classifier is a small model, not the task model itself.

**Why:** OpenRouter's `:nitro` exists because the small classifier misses some prompts. Chimera's keyword scoring is even narrower. A "meta-LLM" call for *routing decisions only* (not for the answer) is a budgeted escape hatch.

**Mapping to `OrchestrationPattern`:** This is the "intelligence" upgrade for any topology — particularly `'fusion'`.

**Effort:** L. Requires either a `MetaRouter` class or a small standalone LLM call before the main pipeline. Cost: one extra request per classified task.

**Source:** Public discussion of [openrouter/nitro](https://openrouter.ai/blog/insights/model-routing).

---

### 3.9 Adopt `partition: "none"` semantics in the fallback chain

**What:** When a `models` fallback chain (§3.2) is built from different *models* (not just providers), allow the router to **re-sort globally** across the entire set rather than treating each model as a fixed bucket. This is exactly what OpenRouter's `partition: "none"` does.

**Why:** Without it, you can't say "across all my fallbacks, give me the cheapest one that meets a throughput floor." With it, you can.

**Mapping to `OrchestrationPattern`:** Applies to all.

**Effort:** M. Requires the `selectProvider` to know about the full chain and re-sort.

**Source:** [OpenRouter Provider Routing docs](https://openrouter.ai/docs/guides/routing/provider-selection) (`sort.partition: "none"`).

---

## 4. What is *not* worth borrowing

1. **`openrouter/nitro`'s 5.5% platform fee on credit purchases.** Chimera's cost model is different; no obvious parallel.
2. **Auto Exacto (tool-call quality routing).** OpenRouter's tool-call quality signal is crowdsourced. Chimera doesn't have the data and shouldn't try to fake it.
3. **EU in-region routing (enterprise).** Out of scope for a coding-agent platform.
4. **Anthropic beta header passthrough (`x-anthropic-beta`).** This is provider-specific plumbing; chimera's `LLMProvider` interface should own this, not the router.
5. **The `data_collection` / `zdr` flags.** Chimera isn't a multi-tenant gateway; it picks its own providers.

---

## 5. Recommendation summary

| Priority | Idea | Maps to | Effort | Impact |
|---|---|---|---|---|
| P0 | Add `cost_quality_tradeoff` 0–10 dial to `classifyTask` | §3.1 | S | Lets users express quality/cost intent; composes with all 4 patterns |
| P0 | Add a `models: AgentConfig[]` fallback chain in `selectProvider` | §3.2 | S | Closes the "no failover" gap; makes `'solo'` and `'duo'` production-ready |
| P1 | `~author/family-latest` alias resolver in `ModelRegistry` | §3.3 | M | Decouples model-version lifecycles from chimera releases |
| P1 | `max_price` per-`AgentConfig` | §3.4 | XS | Per-token cost cap |
| P1 | `multiplyTask` Body-Builder-style generator | §3.5 | M | First-class multi-prompt pattern; enables `'duo'` / `'trio'` |
| P2 | Zero-completion insurance in `CostTracker` | §3.7 | XS | User-trust fix |
| P2 | `task_routed` event with chosen `OrchestrationPattern` and dial | §3.6 | XS | Telemetry; matches OpenRouter's response-`model` exposure |
| P2 | `partition: "none"` global re-sort in fallback chains | §3.9 | M | Cross-model cost-optimized selection |
| P3 | "LLM in the routing loop" (`nitro`-style) for high-stakes tasks | §3.8 | L | Recovers from keyword-scoring blind spots; only for the rare high-stakes case |

The single highest-leverage change is **§3.1 — the `cost_quality_tradeoff` dial**. It is the one OpenRouter concept that chimera's 15-dimension `ComplexityScore` is uniquely well-positioned to consume. The dimensions (`task-router.ts:32-50`) are an input signal that OpenRouter does not have; a continuous dial that the user controls is an output signal that OpenRouter does have. Wiring the two together gives chimera something neither system has alone.

---

## 6. Sources

- [OpenRouter — How to Use Auto Router](https://openrouter.ai/docs/guides/routing/routers/auto-router)
- [OpenRouter — Fusion Router](https://openrouter.ai/docs/guides/routing/routers/fusion-router) (covered in `research/fusion-router-comparison.md`)
- [OpenRouter — Model Fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks)
- [OpenRouter — Provider Selection](https://openrouter.ai/docs/guides/routing/provider-selection)
- [OpenRouter — Latest Model Resolution](https://openrouter.ai/docs/guides/routing/routers/latest-resolution)
- [OpenRouter — Body Builder](https://openrouter.ai/docs/guides/routing/routers/body-builder)
- [OpenRouter blog — How OpenRouter Model Routing Works](https://openrouter.ai/blog/insights/model-routing)
- [OpenRouter blog — How to Get the Lowest-Cost LLM Inference on OpenRouter](https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter)
- [OpenRouter blog — OpenRouter Reliability & Automatic Failover](https://openrouter.ai/blog/insights/reliability-failover)
- [NotDiamond — model-routing engine behind Auto Router](https://www.notdiamond.ai/)

### Internal references

- `C:\Users\pc\Documents\projects\chimera\research\fusion-router-comparison.md` — prior comparison; Fusion Router details
- `C:\Users\pc\Documents\projects\chimera\chimera\packages\chimera-core\src\task-router.ts` — chimera's `TaskRouter`
- `C:\Users\pc\Documents\projects\chimera\chimera\packages\chimera-core\src\coordinator\fusion-executor.ts` — chimera's `FusionExecutor`
- `C:\Users\pc\Documents\projects\chimera\chimera\packages\chimera-core\src\types\agent.ts` — `Mode`, `OrchestrationPattern`, `AgentConfig`
- `C:\Users\pc\Documents\projects\chimera\chimera\packages\chimera-core\src\types\router.ts` — `ComplexityScore`
- `C:\Users\pc\Documents\projects\chimera\chimera\packages\chimera-core\src\event-stream.ts` — `EventStream`
- `C:\Users\pc\Documents\projects\chimera\chimera\packages\chimera-core\src\cost-tracker.ts` — `CostTracker`
- `C:\Users\pc\Documents\projects\chimera\chimera\packages\chimera-providers\src\model-registry.ts` — `ModelRegistry`

---

*Report generated from primary OpenRouter docs (paths under `/docs/guides/routing/*`), three blog posts on the OpenRouter blog, and direct reads of chimera's `task-router.ts`, `fusion-executor.ts`, `event-stream.ts`, `types/agent.ts`, `types/router.ts`, and the existing `research/fusion-router-comparison.md`. The "Intelligence Route" name from the task brief does not correspond to any specific OpenRouter product; the report interprets it as the **`cost_quality_tradeoff` 0–10 dial** (the continuous-dial concept) and the **`openrouter/nitro` LLM-analyzer variant** (the LLM-in-the-loop variant), with §1.1.C explaining both readings.*
