# Adaptive Onboarding & Guidance Audit — Deliverables

**Scope:** Make Chimera approachable to first-time/beginner users *and* efficient
for senior developers — without forking into two experiences. Guidance scales to
an inferred skill level in real time; features are never gated.

**Status:** Implementation complete across `@chimera/learning`, `@chimera/core`,
`@chimera/cli`, and `@chimera/tui`. 174 tests pass (CLI 31, TUI 127, learning 16);
all three packages typecheck clean. Independent verification pending.

---

## 1. Current gaps found in the inventory (Step 1)

Three parallel inventory passes covered every user-facing surface. Findings:

- **No signal-driven tiering existed anywhere.** Every user-facing string was
  static/hardcoded. The only conditional branching was on terminal size, never on
  inferred skill. There was no concept of a per-user skill score.
- **Mixed, expert-leaning default tone.** Most strings assumed an expert reader
  (mode/preset descriptions like "Multi-model fusion", "Autonomous swarm
  orchestration", terse event logs, zod-flavored validator errors).
- **Beginner content was occasionally paired with expert mechanics.** `setup.ts`
  "Setup complete" used friendly tone but then dumped raw `CHIMERA_WRITER_MODEL`
  env vars with no explanation; the `OAL mode` description was a no-op.
- **Recovery gaps.** Errors in `session-orchestrator.ts`, `cli-router.ts`, and
  `workflow.ts` named the failure but rarely suggested a fix (e.g. provider-init
  failure didn't mention `chimera setup` / API key).
- **No discoverable depth toggle.** Nothing let a user say "explain more / less."
- **A static skill block, not a model.** `prompts.ts` had a fixed
  beginner/intermediate/expert *label* rubric — a quiz-like framing, not a
  continuous signal-derived score.
- **Onboarding surface was split.** Docs (README "First run") were the most
  beginner-friendly copy; the in-product wizard and TUI were not.

---

## 2. Updated prompts/text for each touchpoint, tiered (Step 3)

Each touchpoint now authors a `TieredMessage { beginner, intermediate, advanced }`
and renders one tier from the inferred score. Features stay reachable at every
tier — only the *explanation depth* changes.

| Touchpoint | File | Tiering |
|---|---|---|
| System prompt (skill adaptation) | `chimera-core/src/prompts.ts` | Rewritten to confidence-score contract: depth scales, features not gated, explicit override honored, dev inspectability. |
| Mock / no-provider / empty-response recovery | `chimera-cli/src/cli-router.ts` | `renderTiered` + `validateStartupProviders`; beginner gets step-by-step fix, advanced gets one line. |
| Setup wizard (smart defaults, "setup complete", tip) | `chimera-cli/src/commands/setup.ts` | Beginner: explains roles + gives a concrete first command; advanced: terse + config-key pointer. |
| `learn` "no artifacts" | `chimera-cli/src/commands/learn.ts` | Beginner: explains the 2-session threshold + what to do; advanced: names `minSessionsThreshold`. |
| `workflow` run/fail/throw/provider-init | `chimera-cli/src/commands/workflow.ts` | Beginner: defines "step" + re-run hint; advanced: one terse line. |
| Mode/Preset descriptions | `chimera-tui/src/theme.ts` | Full `beginner/intermediate/advanced` `desc`; "OAL mode" got a real beginner description. |
| `HELP_TEXT` | `chimera-tui/src/commands/commands.ts` | Beginner: grouped + explained; advanced: terse full list. |
| First-run screen / input placeholder / empty states | `chimera-tui/src/chat.tsx`, `input.tsx`, `sidebar.tsx`, `event-log.tsx`, `diff-viewer.tsx`, `cost-tracker.tsx`, `session-browser.tsx`, `agent-dashboard.tsx` | Tiered copy; beginner adds a "what to do next" line, advanced stays terse. |
| Docs "First run" | `chimera-cli/README.md` | New "Adaptive guidance" section documenting the depth model + the toggle. |

**Contract-tested strings left untouched** (so existing tests pass): `skill.ts`
"No skills installed", not-found/error strings, etc. These exact substrings are
asserted in `skill-command.test.ts` / `modes.test.ts` and were preserved as the
`intermediate` tier.

---

## 3. Skill-signal scoring implementation (Step 2)

Implemented in `@chimera/learning` (`user-skill-model.ts`), **built + 16 tests pass**.

- **`UserSkillModel`** holds a continuous confidence score in `[0.05, 0.95]`
  (0 = novice, 1 = expert). New/ambiguous users **default to 0.5 (intermediate)** —
  we never assume total novice or total expert on first contact.
- **Signals** (each nudges the score, never jumps it):
  - `observeCommandUsage({flags, usedPreset, scripted, configOverridden})` — advanced
    flags (`--preset`, `--repl`, `--no-learn`, …), config overrides, scripting.
  - `observeTaskOutcome({clean, repeatedErrorsSameStep, revisionCycles})` — fast/clean
    execution vs. repeated errors on the same step.
  - `observeMessage(text)` — technical-vocabulary markers vs. plain-language questions.
  - `observeSignal(signal)` — fine-grained named signals.
- **Explicit override (strongest, reversible):** `setExplainMore()` / `setExplainLess()`
  bias the tier immediately and reversibly (`clearOverride()`); the underlying
  behavior tracking is preserved.
- **`tier()`** returns `beginner | intermediate | advanced`. Low-evidence (fewer than
  `minSamples` observations, no override) → `intermediate` by design.
- **`explainDepth()`** → `full | condensed | minimal`.
- **Inspectability:** every mutation is recorded in an audit trail
  (`getAuditLog()` / `formatAudit()`); `tierReason()` explains the current tier in one
  line. Surfaced in dev mode (`CHIMERA_DEV=1`).

**Wiring (real-time, per Step 2):**
- One-shot `run()` path: `skillModel` created, fed via `observeCommandUsage` +
  `observeTaskOutcome`.
- REPL path: per-turn `observeMessage(input)`, override detection on
  "explain more/less", and `observeTaskOutcome` after each task.
- One-shot subcommands (`learn`/`workflow`/…): `skillTierFromCli(argv)` builds a
  throwaway model from process flags so advanced flags still raise the score.

---

## 4. "Get more value" surfacing logic (Step 4)

In `@chimera/learning/guidance.ts` (`suggestNextValue` + `CAPABILITY_TIPS`), **wired
into the REPL** (`cli-router.ts`).

- A **17-capability** catalog (`CAPABILITY_TIPS`) with beginner vs advanced copy for
  each (presets, config, mcp, workflows, loop, goal, sessions, export, hooks, ide,
  vim, teleport, eval, doctor, custom-commands, skills, learning engine).
- `suggestNextValue(model, seenCapabilities)` returns **ONE** capability — never a
  list (avoids overwhelming beginners). Beginners draw from a workflow-core order;
  advanced users draw from an automation/config/API order.
- **Trigger:** at a natural pause — after a task *completes* (`result.status === 'done'`),
  **throttled to once every 3 turns**. It logs a single 💡 line; it never interrupts
  mid-task. Dev mode also logs the tier reason.
- Capability usage is tracked from the user's `/commands`, so the nudge never repeats
  something already touched.

---

## 5. Guardrails (Step 5)

- **Experienced users are not slowed:** advanced tier is terse and surfaces the
  power-user shortcut/keybinding; tutorial copy is never forced on a high score.
- **Struggling users are never stranded:** if the inferred score is low or the user
  says "explain more", they get the why-first, jargon-defined tier. The score can
  move mid-session.
- **Toggle is discoverable + reversible:** `(m)` more / `(l)` less keybindings in the
  TUI (footer always shows the hint); the natural-language "explain more/less" also
  works in the REPL; both flip back and forth.
- **Adaptive logic is inspectable:** `CHIMERA_DEV=1` logs the chosen tier + reason;
  `UserSkillModel.formatAudit()` exposes the full trail for tuning.

---

## 6. Surfaces flagged — could not determine correct tiering without product context

These were left as-is (or minimally glossed) rather than guessed:

1. **`skill.ts` validator error strings** (`L105` "not strict", `L115` "strict-empty
   schema", `L96` input-type errors). These are developer-facing diagnostics; terse
   expert output may be intentional. Judgment call deferred to PM — flag if you want
   beginner-friendly variants.
2. **`daemon/src/server.ts` error strings** — the daemon is a JSON-RPC surface, not a
   primary onboarding channel; its errors were inventoried but left for a follow-up to
   keep this change focused on CLI/TUI/docs.
3. **`session-orchestrator.ts` recovery strings** — richest source of user-visible
   recovery text, but they fire deep in execution with no per-message skill signal
   available there. Tiering them requires plumbing the session's `UserSkillModel` into
   the orchestrator (a larger refactor). Flagged as the highest-value future hook.
4. **`setup.ts` "advanced" tier wording** — the TUI agent chose terse advanced copy
   (e.g. bare `"> "`-style placeholders). If PM prefers the advanced placeholder to
   keep existing help text, that's a one-line change.

---

## Verification

- `chimera-learning`: `npx tsc --noEmit` clean; `vitest run` 16/16 pass.
- `chimera-cli`: clean; 31/31 pass (contract-tested strings intact).
- `chimera-tui`: clean; 127/127 pass.
- Independent `verification` agent: **pending** (running at time of writing).
