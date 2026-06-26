"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SKILL_BUNDLES = void 0;
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
exports.SKILL_BUNDLES = {
    code: ['chimera-modes', 'chimera-workflows', 'chimera-tool-loop', 'chimera-skill-creation'],
    plan: ['chimera-modes', 'chimera-workflows', 'chimera-tool-loop'],
    ask: ['chimera-modes', 'chimera-cli'],
    debug: ['chimera-modes', 'chimera-tool-loop', 'chimera-safety', 'chimera-telemetry', 'chimera-skill-creation'],
    review: ['chimera-modes', 'chimera-workflows', 'chimera-safety', 'chimera-skill-creation'],
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
//# sourceMappingURL=skill-bundles.js.map