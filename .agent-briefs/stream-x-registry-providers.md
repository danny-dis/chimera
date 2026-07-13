# Agent X — Expand model registry + first-class provider routing for all major labs

**Target package:** `packages/chimera-providers` (v0.1.5)
**Repo root:** `C:/Users/pc/Documents/projects/chimera`
**Goal:** Make Chimera support models from ALL major AI labs as first-class providers, and expand the built-in `ModelRegistry` with current models per lab.

## Context you must read first
- `packages/chimera-providers/src/model-registry.ts` — `ModelEntrySchema` (lines 3-29) defines the shape. `MODELS: ModelEntry[]` (lines 33+) is the hardcoded catalog. `ModelRegistry` class at line 419. Currently covers: deepseek, qwen, moonshot, google, openai, anthropic, mistral, meta, cohere. MISSING: xAI (grok), Perplexity (sonar).
- `packages/chimera-providers/src/provider-factory.ts` — `ProviderTypeSchema` enum (lines 11-18) lists `openai, anthropic, google, ollama, openai-compatible, mock`. `discoverEnvConfigs` (lines 147-183) maps env vars → providers. `buildProvider` switch (lines 185-244) routes to concrete providers. `OpenAICompatibleProvider` + `OpenAICompatibleConfig` already exist and handle ANY OpenAI-format base URL (it strips `/v1` and appends `/v1/chat/completions`). `AnthropicProvider` handles Anthropic Messages format.
- `packages/chimera-providers/src/providers/openai-compatible.ts` — `OpenAICompatibleConfig` = `{ baseUrl, apiKey, model, options? }`. The provider already auto-detects.

## Tasks (do ALL, in this package only)
### 1. Registry expansion (`model-registry.ts`, the `MODELS` array)
Add realistic, current entries (use plausible 2025/2026 specs; you may use representative pricing/context windows — this is a catalog, not billing-critical). For EACH add `id` (format `<provider>/<model>`), `name`, `provider`, `contextWindow`, `maxOutputTokens`, `pricing`, `capabilities`, `degradationThreshold`, `tier`, `releaseDate`. Tiers: `cheap` (small/fast), `mid` (solid all-rounders), `frontier` (top flagships), `reasoning` (explicit reasoning models).

Add these labs/models (do not remove existing entries):
- **xAI:** `xai/grok-4`, `xai/grok-4.1`, `xai/grok-4-fast` (provider: 'xai')
- **Perplexity:** `perplexity/sonar`, `perplexity/sonar-pro` (provider: 'perplexity')
- **OpenAI (current):** `openai/gpt-5`, `openai/gpt-5-mini`, `openai/gpt-5-nano`, `openai/o3`, `openai/o4-mini`
- **Anthropic (current):** `anthropic/claude-opus-4.1`, `anthropic/claude-sonnet-4.5` (already present? if not add), `anthropic/claude-haiku-4.5`
- **Google (current):** `google/gemini-3-pro`, `google/gemini-2.5-flash`, `google/gemini-2.5-flash-lite` (if not present)
- **DeepSeek (current):** `deepseek/deepseek-v4` (provider: 'deepseek')
- **Meta (current):** `meta/llama-4-scout`, `meta/llama-4-maverick` (if not present)
- **Mistral (current):** `mistral/mistral-large-3`, `mistral/mistral-medium-3`
- **Qwen (current):** `qwen/qwen3-235b`, `qwen/qwen3-32b`
- **Cohere (current):** `cohere/command-a`, `cohere/command-r7b`

Assign tiers sensibly: flagships (gpt-5, claude-opus-4.1, gemini-3-pro, grok-4, llama-4-maverick, mistral-large-3, command-a, deepseek-v4, o3, sonar-pro) → `frontier` or `reasoning` (reasoning models like o3/sonar → `reasoning`). Mini/nano/haiku/flash-lite/small → `cheap` or `mid`.

### 2. First-class provider routing (`provider-factory.ts`)
- Extend `ProviderTypeSchema` enum to include: `'xai'`, `'perplexity'`, `'cohere'`, `'mistral'`, `'meta'`, `'deepseek'`, `'qwen'`, `'moonshot'`. (Note: `openai`, `anthropic`, `google`, `ollama`, `openai-compatible`, `mock` already exist.)
- In `discoverEnvConfigs`, add entries for the new providers with their `modelEnv` + `baseUrl`:
  - xai: `XAI_MODEL` / `https://api.x.ai/v1`
  - perplexity: `PERPLEXITY_MODEL` / `https://api.perplexity.ai`
  - cohere: `COHERE_MODEL` / `https://api.cohere.ai/v2`
  - mistral: `MISTRAL_MODEL` / `https://api.mistral.ai/v1`
  - meta: `META_MODEL` / `https://api.llama.com/v1` (or openai-compatible endpoint)
  - deepseek: `DEEPSEEK_MODEL` / `https://api.deepseek.com`
  - qwen: `QWEN_MODEL` / `https://dashscope.aliyuncs.com/compatible-mode/v1`
  - moonshot: `MOONSHOT_MODEL` / `https://api.moonshot.cn/v1`
- In `resolveApiKey` `keyMap`, add: `xai: 'XAI_API_KEY'`, `perplexity: 'PERPLEXITY_API_KEY'`, `cohere: 'COHERE_API_KEY'`, `mistral: 'MISTRAL_API_KEY'`, `meta: 'META_API_KEY'`, `deepseek: 'DEEPSEEK_API_KEY'`, `qwen: 'QWEN_API_KEY'`, `moonshot: 'MOONSHOT_API_KEY'`.
- In `resolveBaseUrl` `urlMap`, add the same base URLs for the new providers.
- In `buildProvider` switch, add cases for the new providers that route to `new OpenAICompatibleProvider({ baseUrl: resolveBaseUrl(config), apiKey: resolveApiKey(config), model: config.model, options: { timeoutMs: config.timeoutMs } })`. (They are all OpenAI-compatible REST endpoints.) Import `OpenAICompatibleProvider` is already present.
- In `listModels` switch, you MAY add `case 'xai'/'perplexity'/...` returning `[]` (or best-effort) — returning `[]` on failure is already the safe default; only add if trivial. Do NOT break existing cases.

## Hard constraints
- Do NOT modify `OpenAICompatibleProvider` or `AnthropicProvider` internals unless strictly necessary.
- Do NOT change the `ModelEntrySchema` shape.
- Keep `tsc` clean: run `cd packages/chimera-providers && npx tsc -p tsconfig.json --noEmit` (NOTE: `npx tsc --noEmit` WITHOUT `-p` gives FALSE errors — always use `-p tsconfig.json`).
- Add a small test file `packages/chimera-providers/src/__tests__/registry-expansion.test.ts` asserting: (a) every new `ModelEntry.id` is present in a fresh `ModelRegistry().getAll()`, (b) `ProviderFactory.create` builds a provider for `xai` and `perplexity` configs without throwing (use a fake apiKey), (c) the new enum members are accepted by `ProviderTypeSchema`.
- Run `cd packages/chimera-providers && npx vitest run` and confirm green. Report files changed, test counts, and the registry entry count before/after.
