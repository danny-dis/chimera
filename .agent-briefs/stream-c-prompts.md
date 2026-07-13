# Stream C — Prompt engineering: audit all system prompts, ensure they guide even small LLMs to be excellent agents

**Target file:** `packages/chimera-core/src/prompts.ts` (and any role prompts it references)
**Discipline skill grounding:** `prompt-engineering` (general: anchor identity first, separate MANDATES/DIRECTIVES/CONSTRAINTS, put NEGATIVE before POSITIVE, close with drift sentinel), `context-engineering` (context window is fixed; every token is opportunity cost), `software-engineering` (no dead text, YAGNI).
**Coding agent:** you (openclaude). Edit files INSIDE this repo only. Do NOT read/write files outside `C:/Users/pc/Documents/projects/chimera`.

## Problem
`prompts.ts` is already well-structured (CL4R1T4S-inspired: identity anchored in first 8 tokens, `<operating_environment>` block, drift sentinel `[!] AS YOU WISH [!]`). But it is **long and static** — the same ~110-line `CHIMERA_CORE_IDENTITY` + role prompts go to every model regardless of size. Small/cheap models (e.g. llama-3.1-8b, qwen-7b) have weaker instruction-following and get lost in long prompts; they need (a) a tighter, higher-signal variant, and (b) explicit "if you are a small model, follow these simplification rules" guidance. We want the prompts to *lead* a weak model to behave like a strong agent, not just inform a strong one.

## What to do (audit + improve, surgical)
1. **Audit every system prompt** in `prompts.ts` (CHIMERA_CORE_IDENTITY, CONVERSATIONAL_IDENTITY, SKILL_LEVEL_ADAPTATION, AGENT_PROMPTS.writer + reviewer + challenger + synthesizer, RECOVERY_PROMPTS). For each, note: (a) redundant/self-repeating sentences, (b) decorative `# ... #` markup that wastes tokens on small models, (c) any instruction that contradicts another, (d) anything a small model will likely ignore. Write the audit as a short comment block at the top of the file OR a separate `.agent-briefs/stream-c-prompt-audit.md`.
2. **Add a compact tier variant.** Add `COMPACT_CORE_IDENTITY` (≈30-40 lines) that preserves ALL hard mandates (GROUND TRUTH, INSTRUCTION HIERARCHY, NO PERSONA BLEED, structured-output rule, drift sentinel) but drops verbose examples and decorative markers. Add `compactAgentPrompt(role)` helpers for writer/reviewer that keep the operational essentials. These are consumed by Stream A's `compressPromptForTier` (do NOT implement compression here — just export the compact variants; Stream A imports them).
3. **Small-model guidance block.** Add a `SMALL_MODEL_GUIDANCE` constant (~10 lines) appended ONLY in cheap-tier mode (Stream A will append it): teaches the model to (a) prefer the single most likely correct action over enumerating many, (b) emit minimal valid JSON, (c) ask ONE precise question if truly blocked, (d) never pad. Keep it commanding, not apologetic.
4. **Fix any contradictions found in the audit** (e.g. if a prompt says "be proactive" but another says "always ask" — reconcile).
5. Keep `CHIMERA_CORE_IDENTITY` and `AGENT_PROMPTS` frontier behavior byte-identical (Stream A depends on them unchanged for `frontier` tier).

## Hard constraints
- Do NOT change exported names that other files import (grep first). ADD new exports; do not rename/remove existing ones.
- Do NOT touch `model-capabilities.ts`, `session-orchestrator.ts` logic, or CLI. Stream A handles wiring; you only produce the compact variants + audit + small-model guidance constant.
- Add a test asserting `COMPACT_CORE_IDENTITY` is non-empty, preserves the drift sentinel and GROUND TRUTH mandate, and is materially shorter than `CHIMERA_CORE_IDENTITY`.
- `cd packages/chimera-core && npx tsc --noEmit` must be clean and `npx vitest run` (or package test cmd) for the prompts test must pass.

## Definition of done
- Audit written (inline comment or separate file).
- `COMPACT_CORE_IDENTITY` + compact role helpers + `SMALL_MODEL_GUIDANCE` exported.
- Contradictions fixed; frontier prompts unchanged.
- Tests pass with exact counts.
- Report: audit findings (top 5), exports added, test results.
