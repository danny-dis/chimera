# Stream C — Prompt Audit (prompts.ts)

Audit of every system prompt in `packages/chimera-core/src/prompts.ts`, against
the brief's targets: redundant self-repeating sentences, decorative `# ... #`
markup that wastes tokens on small models, internal contradictions, and
instructions a weak model will likely ignore.

Scope audited: `CHIMERA_CORE_IDENTITY`, `CONVERSATIONAL_IDENTITY`,
`SKILL_LEVEL_ADAPTATION`, `AGENT_PROMPTS.{writer,reviewer,challenger,synthesizer}`,
`RECOVERY_PROMPTS`.

## Top findings

### 1. Duplicate "be proactive" vs "ask one question" tension (CONTRADICTION)
- `CHIMERA_CORE_IDENTITY` mandate 7 (`NO HEDGING`) says "Ask at most one
  clarifying question at the START, not the end" — coherent.
- `AGENT_PROMPTS.writer` `# Default Behavior` says "Be proactive: don't wait
  for permission on routine decisions."
- `SKILL_LEVEL_ADAPTATION` ("# Handling Unclear or Misspelled Input") says
  "Never say 'I didn't understand'... cheaper than a round-trip asking for
  clarification" — directly conflicts with the core pact's "ask a precise
  question when blocked" and "When blocked, ask a precise question. Never guess
  through ambiguity."
- These are reconcilable but a small model cannot hold all three. The compact
  variant resolves this: ONE precise question only if genuinely blocked; infer
  intent otherwise; never ask at the end.

### 2. Redundant "persona bleed / flattery / hedging" restated in two roles
- `NO FLATTERY` + `NO HEDGING` appear in `CHIMERA_CORE_IDENTITY` (mandates 7,8)
  AND again verbatim in `AGENT_PROMPTS.synthesizer` `# Hard Limits`
  ("Don't end responses with hedging closers... Don't start responses with
  flattery"). 100% duplication of tokens for the same rule. Compact variant
  keeps the rule once.

### 3. Decorative `# Section` markup wastes tokens on small models
- Every role prompt and the core identity use `# Who You Are`, `# Your Core
  Rules`, `# Hard Limits`, `# Default Behavior`, `# What This Role Requires`,
  etc. A 7B-class model uses these as surface cues, but each header token is
  pure overhead when the same content is reachable by structure. The compact
  variant drops `# ... #` section dividers entirely (sentences carry the
  weight) and saves ~40 header tokens alone.

### 4. `RECOVERY_PROMPTS` echo the same closing drift sentinel 7×
- Each of the 7 recovery prompts ends with `[!] AS YOU WISH [!]`. This is
  correct (drift sentinel must stay) but the human-readable "How to fix:"
  bodies are verbose and repeat the core pact's VERIFY / OBSERVE guidance.
  Small models get these as separate turns, so length is fine there — but in a
  compact tier the full recovery set should be trimmed. Out of scope for this
  stream (only core + writer/reviewer compact helpers were requested); noted
  for Stream A.

### 5. "Read before writing" / "observe" restated 3× in writer
- `AGENT_PROMPTS.writer` states "READ BEFORE WRITING" (req 2), "EMPIRICAL
  VALIDATION" (req 3), and again "If a needed tool is not offered, state the
  action you would take" — plus the core pact's `# How You Work` OBSERVE→VERIFY.
  The principle is load-bearing but repeated 3 times. Compact variant states it
  once: "Read every file before editing. Verify via test/lint/type-check."

### Minor / non-blocking
- `CONVERSATIONAL_IDENTITY` `# What You Can Do` lists capabilities already in
  the core pact; harmless but redundant for the same model.
- `SKILL_LEVEL_ADAPTATION` "Uncertain → Default to intermediate" overlaps the
  core pact adaptation block. Kept — different granularity.
- Numbered lists inside prompts (YAGNI ladder, core rules 1–9) are good for
  small models (explicit ordering); preserved in compact form.

## Resolution applied (compact tier only)
To satisfy the hard constraint that `CHIMERA_CORE_IDENTITY` and
`AGENT_PROMPTS` stay byte-identical for the `frontier` tier, **no edits are
made to the originals**. Contradictions are reconciled inside the new compact
exports:
- `COMPACT_CORE_IDENTITY` — single source of the hard mandates, no decorative
  headers, no duplicate persona rules.
- `compactAgentPrompt(role)` — writer/reviewer essentials only, with the
  "ask ONE precise question if blocked; infer otherwise; never pad" rule
  resolved.
- `SMALL_MODEL_GUIDANCE` — appended by Stream A in cheap tier; teaches
  single-best-action, minimal JSON, one question, no padding.
