/**
 * Static map of recommended skills per `Mode`.
 *
 * Skills are resolved at runtime by `loadSkillsForMode` (see
 * `skill-loader.ts`). The map below is the source of truth for "what should
 * be loaded for mode X out of the box" — the default load-out is the
 * **chimera-native** skill set shipped inside `@chimera/core` so the agent
 * knows how to use its own platform on first run, with no user setup.
 *
 * Users can override or extend the load-out by dropping skill files into
 * `<workspace>/.chimera/skills/`. A same-named file in the workspace wins
 * over the bundled version.
 *
 * Adding a skill:
 *   1. For a chimera-native skill: add an entry to
 *      `./bundled/skills.ts` and reference it from the array below.
 *   2. For a user-supplied skill: drop a `.md` file (with YAML frontmatter)
 *      into `<workspace>/.chimera/skills/<name>.md` (or
 *      `~/.config/chimera/skills/`). Add the name to the array below.
 *   3. Restart the orchestrator.
 *
 * Removing a skill is a one-line edit. Unknown names are silently skipped
 * (the user may not have installed that skill yet).
 */
import type { Mode } from '../types/agent.js';

/**
 * Default skill bundle for each mode. A bundle is a list of skill names;
 * `loadSkillsForMode` resolves each through the standard bundled →
 * workspace → global resolution path.
 *
 * Rationale per mode:
 *   - `code`   — modes + workflows overview + tool-loop guardrails. The
 *                dominant edits need to know what tools they may call and
 *                when to stop iterating.
 *   - `plan`   — modes + workflows + tool-loop. Planning frequently reads
 *                the same files repeatedly; the loop guard is the most
 *                common cost-control intervention here.
 *   - `ask`    — modes only. A cheap Q&A does not need the full safety
 *                briefing on every turn.
 *   - `debug`  — modes + tool-loop + safety. Debug runs are where tool
 *                loops and untrusted-output sanitization matter most.
 *   - `review` — modes + workflows + safety. The reviewer/challenger pair
 *                is itself a workflow; safety gates the verdicts.
 *   - `oal`    — internal automation; load everything.
 */
export const SKILL_BUNDLES: Record<Mode, readonly string[]> = {
  code: ['chimera-modes', 'chimera-workflows', 'chimera-tool-loop', 'chimera-skill-creation', 'chimera-yagni'],
  plan: ['chimera-modes', 'chimera-workflows', 'chimera-tool-loop', 'chimera-yagni'],
  ask: ['chimera-modes', 'chimera-cli'],
  debug: ['chimera-modes', 'chimera-tool-loop', 'chimera-safety', 'chimera-telemetry', 'chimera-skill-creation'],
  review: ['chimera-modes', 'chimera-workflows', 'chimera-safety', 'chimera-skill-creation', 'chimera-overengineering-review', 'chimera-debt-tracker'],
  oal: [
    'chimera-modes',
    'chimera-workflows',
    'chimera-safety',
    'chimera-tool-loop',
    'chimera-cli',
    'chimera-telemetry',
    'chimera-cost-control',
    'chimera-learning',
  ],
  auto: ['chimera-modes', 'chimera-workflows', 'chimera-tool-loop', 'chimera-skill-creation'],
};
