# Stream A — Harness: tier-aware capability helpers (NON-CONFLICTING SCOPE)

**Target package:** `packages/chimera-core` (v0.1.5)
**Discipline skill grounding:** `packages/chimera-context/skills/context-engineering`, harness principle (harness is 90% of agent quality), `software-engineering` (YAGNI, no dead code).
**Coding agent:** you (opencode). Edit files INSIDE this repo only.

## Scope boundary (IMPORTANT — do not exceed)
You own **ONLY** `packages/chimera-core/src/coordinator/model-capabilities.ts` and a **NEW** test file you create. Do NOT touch `prompts.ts`, `session-orchestrator.ts`, or any file in `@chimera/context`. Two other agents own those. If you need a capability that lives elsewhere, export it from here and document it; do not edit the other files.

## Problem
`@chimera/core` infers a model `tier` (`frontier`/`mid`/`cheap`) in `src/coordinator/model-capabilities.ts` via `inferCapabilities()`. But there is no helper to translate that tier into runtime decisions (which tools to expose, how much context a cheap model can handle). Downstream code needs a single, tested source for "given this tier, what should the harness do?"

## What to implement (surgical, in `model-capabilities.ts` only)
1. **`coreToolsForTier(tier): string[]`** — returns the limited core tool set for `cheap` models (e.g. `['read_file','search_files','write_file','edit_file','terminal','ask']`) and the full set / sentinel for `mid`/`frontier` (return `['*']` meaning "all tools"). Keep the list small and high-signal for cheap.
2. **`contextBudgetForTier(tier): { maxToolOutputChars: number; maxContextTokens: number; truncationChars: number }`** — cheap models get tighter caps (e.g. `maxToolOutputChars: 1500`, `maxContextTokens: 32000`, `truncationChars: 120`); mid (`4000`, `120000`, `200`); frontier (`8000`, `200000`, `200`). This gives the orchestrator (owned by another agent) a single place to read caps from.
3. Keep `inferCapabilities` and `buildPool` exports byte-compatible. Add the two new exports.
4. **NEW test file** `src/coordinator/__tests__/model-capabilities.test.ts` covering: tiers map to correct tool sets; cheap is a strict subset of frontier; context budgets ordered `cheap < mid < frontier`; `inferCapabilities` still returns the right tier for known + unknown model ids (don't break existing behavior).

## Hard constraints
- Do NOT modify `prompts.ts`, `session-orchestrator.ts`, skill markdown, or `@chimera/context`.
- Keep existing exports intact (other code imports them).
- Verify: `cd packages/chimera-core && npx tsc --noEmit` (clean) and `npx vitest run src/coordinator/__tests__/model-capabilities.test.ts` (all pass). Use `npx vitest run <file>` — NOT `--project`.
- File stays under ~300 LOC.

## Definition of done
- `coreToolsForTier` + `contextBudgetForTier` exported from `model-capabilities.ts`.
- New test file passes with exact counts.
- `tsc --noEmit` clean.
- Report: functions added, test pass counts, and the exact names/signatures downstream code should import.
