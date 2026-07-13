# Agent Y — Update tier inference for all major labs

**Target package:** `packages/chimera-core` (v0.1.5)
**Repo root:** `C:/Users/pc/Documents/projects/chimera`
**Goal:** Make `inferCapabilities()` (the tier/specialty classifier) correctly recognize models from ALL major labs so the harness routes and budgets them properly — especially cheap/local vs frontier.

## Context you must read first
- `packages/chimera-core/src/coordinator/model-capabilities.ts` — `PATTERNS: PatternEntry[]` (lines 23-44) is an ordered regex→tier+specialties map (first match wins, case-insensitive). `inferCapabilities(modelId)` (line 62) returns `{modelId, tier, specialties, costPerMillionInput, costPerMillionOutput}`. Unknown → `mid`/`general`. ALSO contains `coreToolsForTier()` and `contextBudgetForTier()` (added in a prior commit) — do NOT touch those.
- `packages/chimera-core/src/coordinator/__tests__/model-capabilities.test.ts` — existing tests (19 cases).

## Tasks (do ALL, in this file/package only)
### 1. Extend `PATTERNS` to cover all major labs
Keep the 3-tier (frontier / mid / cheap) structure. Add/refine regexes so these resolve correctly (first match wins — put more specific/recent before generic):

FRONTIER / REASONING tier patterns should match:
- OpenAI: `gpt-5(?!-mini|-nano)`, `o3`, `o4`, `gpt-4o(?!-mini)`
- Anthropic: `claude-4`, `claude-opus`, `claude-3\.5-sonnet`, `claude-sonnet-4`
- Google: `gemini.*(pro|ultra)`, `gemini-3`
- xAI: `grok-4`, `grok-3`
- DeepSeek: `deepseek.*(v4|v3|r1)`
- Meta: `llama-4-(maverick|opus|scout)` (scout may be mid), `llama-3\.1-405b`
- Mistral: `mistral-large`, `mistral-(medium|large)-3`, `codestral`, `mistral-large-2`
- Qwen: `qwen3-(235b|72b)`, `qwen.*max`, `qwen-2\.5-72b`
- Cohere: `command-a`, `command-r-plus`
- Perplexity: `sonar`, `sonar-pro` (reasoning/search)
- Moonshot: `kimi-k2`

MID tier patterns:
- `gpt-5-mini`, `gpt-5-nano`, `gpt-4o-mini`, `claude-3-5-haiku`, `claude-haiku-4`, `claude-3-haiku`, `gemini.*flash(?!.*lite)`, `gemini-2\.5-flash`, `llama-4-scout`, `llama-3\.1-(70b)`, `mistral-medium`, `sonnet`, `grok-4-fast`, `qwen3-32b`, `qwen.*(32b|14b)`, `command-r7b`, `deepseek.*lite`

CHEAP tier patterns:
- `gemini.*flash.*lite`, `gpt-3\.5`, `llama-3\.1-(8b|70b)`, `mistral-small`, `qwen.*(7b|14b)`, `phi-3`, `phind`, `haiku`, `deepseek.*(lite|v2)`

Also add a NEW pattern at the TOP that keys off the `provider/` prefix so IDs like `xai/grok-4` still match (the existing patterns match on the model substring which works, but ensure `grok`, `sonar`, `command-a`, `kimi` are covered).

### 2. Tests
Add cases to `model-capabilities.test.ts` (or a new `tier-inference.test.ts`) asserting:
- `inferCapabilities('xai/grok-4').tier === 'frontier'`
- `inferCapabilities('perplexity/sonar-pro').tier === 'reasoning'`
- `inferCapabilities('openai/gpt-5').tier === 'frontier'`
- `inferCapabilities('anthropic/claude-opus-4.1').tier === 'frontier'`
- `inferCapabilities('google/gemini-3-pro').tier === 'frontier'`
- `inferCapabilities('deepseek/deepseek-v4').tier === 'frontier'`
- `inferCapabilities('meta/llama-4-scout').tier === 'mid'`
- `inferCapabilities('mistral/mistral-large-3').tier === 'frontier'`
- `inferCapabilities('qwen/qwen3-32b').tier === 'mid'`
- `inferCapabilities('cohere/command-a').tier === 'frontier'`
- `inferCapabilities('openai/gpt-5-mini').tier === 'mid'`
- `inferCapabilities('some-unknown-model').tier === 'mid'` (fallback unchanged)

## Hard constraints
- Do NOT modify `coreToolsForTier` / `contextBudgetForTier` (prior work).
- Keep `tsc` clean: `cd packages/chimera-core && npx tsc -p tsconfig.json --noEmit` (ALWAYS use `-p tsconfig.json`; bare `npx tsc --noEmit` reports FALSE errors).
- Run `cd packages/chimera-core && npx vitest run src/coordinator/__tests__/model-capabilities.test.ts` and any new test file; report pass counts and the before/after pattern count.
