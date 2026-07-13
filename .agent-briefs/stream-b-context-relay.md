# Stream B — Context: wire ToolContextRelay + kill RelayRacing duplication + per-agent windows

**Target package:** `packages/chimera-core` (orchestrator) + `packages/chimera-context` (RelayRacing, ToolContextRelay)
**Discipline skill grounding:** `packages/chimera-context/skills/relay-racing`, `tool-context-relay`, `context-engineering`, `context-budget`, `observation-masking`, `handoff-protocol`. Read ALL six before coding — they define the contract.
**Coding agent:** you (mimo). Edit files INSIDE this repo only. Do NOT read/write files outside `C:/Users/pc/Documents/projects/chimera`.

## Problem
The orchestrator (`packages/chimera-core/src/session-orchestrator.ts`) has a working relay-racing + masking + handoff loop in the writer tool loop (~lines 230-234, 305-309, 730-792). But three defects against the skill contract:
1. **Huge tool outputs are inlined, not relayed.** Tool results >2000 chars should be `ToolContextRelay.box()`'d (skill: tool-context-relay) and replaced with a `internal://relay-...` reference, so context stays small. Today they're inlined then only truncated to 200 chars at mask time — wasteful and loses signal the model may need later (it can `unbox`/readSlice on demand).
2. **RelayRacing is duplicated, not reused.** `session-orchestrator.ts` inlines `MASK_OUTPUT_LIMIT=200`, `MASK_ARGS_LIMIT=100` and a `maskedObservations` Map (lines 230-234, 305-309) instead of using the imported `RelayRacing` from `@chimera/context` (already imported at line 30). Single source of truth violation.
3. **Hardcoded `default` agent + 200k window.** `relayRacing.registerAgent('default', 200_000)` and `trackTokens('default', ...)` — there is no per-agent context window. The skill's whole point is per-agent tiers. Wire real per-agent windows where multiple agents run.

## What to implement (surgical)
1. **Box large tool outputs.** In `src/session-orchestrator.ts`, in the tool-result message builder / the loop at ~line 727-735, before messages are added to context: if a tool result string exceeds `2000` chars, `ToolContextRelay.box()` it (import `ToolContextRelay` from `@chimera/context` — NOTE: check whether chimera-core currently imports from @chimera/context; the file says it inlined to avoid a dependency, so either (a) add the import if the dep exists, or (b) use the `tool-context-relay.ts` logic locally but DO NOT re-duplicate — instead refactor the inlined masking to delegate to `RelayRacing` and add a local `box` using the same reference scheme). When the model later needs the content it can be unboxed; for now the reference in context is enough. Add a test proving a >2000-char result is replaced by `internal://relay-...` in the message sent to the LLM.
2. **Remove RelayRacing duplication.** Delete the inlined `MASK_OUTPUT_LIMIT`/`MASK_ARGS_LIMIT` constants and the `maskedObservations` Map; delegate masking to the already-imported `RelayRacing` instance (`this.relayRacing.maskObservations` already used at 732 — good; just remove the parallel tracking map and keep `maskedTokensSaved` via `relayRacing` API if available, else a thin wrapper). Ensure no behavior change for frontier path.
3. **Per-agent windows.** Replace `registerAgent('default', 200_000)` with registration using the actual agent id (`writerId`) and, if the provider exposes a context window, use it; else keep 200_000 default but key by agent id so future multi-agent runs isolate correctly. Update `trackTokens`/`shouldMask` calls to use the real agent id.

## Hard constraints
- Do NOT change the handoff protocol behavior or the compaction pipeline (`runCompactionPipeline`) — they work.
- Do NOT modify `@chimera/context` skill markdown. You MAY edit `@chimera/context/src/*.ts` if you need a small export, but prefer reusing existing exports.
- Keep existing tests green: `cd packages/chimera-core && npx tsc --noEmit` and run the orchestrator + relay tests. Also `cd packages/chimera-context && npx tsc --noEmit` if you touched it.
- No scope creep: this is about relay/context only. Do not touch prompts, model-capabilities, or CLI.
- Files under ~300 LOC; split if needed.

## Definition of done
- Large tool outputs boxed to `internal://relay-...` references in context; verified by test.
- Inlined RelayRacing constants/map removed; masking delegated to imported `RelayRacing`.
- Per-agent registration (not `default`) with real agent id.
- `tsc --noEmit` clean for core (and context if touched); targeted tests pass with exact counts reported.
- Report: files changed, what you verified, and any skill contract point you couldn't satisfy + why.
