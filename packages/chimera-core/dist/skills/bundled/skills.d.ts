/**
 * Bundled skills — shipped inside `@chimera/core` and resolved before any
 * on-disk path.
 *
 * These are the "always-on" skills. They teach the agent how to use chimera
 * itself (modes, workflows, CLI, telemetry, safety, cost control) and are
 * automatically loaded for every mode that needs them.
 *
 * **Resolution order** (first match wins, set by `loadSkill`):
 *   1. Bundled skills (this file)
 *   2. `<workspace>/.chimera/skills/<name>.md`
 *   3. `~/.config/chimera/skills/<name>.md`
 *   4. `<workspace>/.kilo/skills/<name>.md`       (legacy shim, deprecation)
 *   5. `~/.config/kilo/skills/<name>.md`          (legacy shim, deprecation)
 *
 * Bundled skills are content-addressed by name. A user with a same-named file
 * in `.chimera/skills/` overrides the bundled version — that is the documented
 * extension point.
 *
 * Editing a bundled skill:
 *   1. Update the constant below.
 *   2. Run `pnpm -F @chimera/core test` to confirm the new content is in sync.
 *   3. Bump the version constant at the bottom of this file.
 *
 * Why TypeScript string constants (not `.md` files + a JSON manifest)?
 *   - tsc bundles them into `dist/` automatically; no fs lookup at runtime.
 *   - Grep-able in source, no frontmatter parsing.
 *   - One file to maintain, no separate manifest to drift.
 *   - The skill content is small (~1KB each); the file is still under 300 lines.
 */
export interface BundledSkill {
    /** Stable, content-addressed name. Used as the lookup key. */
    name: string;
    /** One-line description; surfaced in `chimera skill list` and the system prompt. */
    description: string;
    /** Which modes this skill is recommended for. Drives `SKILL_BUNDLES`. */
    modes: ReadonlyArray<'ask' | 'plan' | 'code' | 'debug' | 'review' | 'oal' | 'auto' | 'all'>;
    /** Markdown body. No frontmatter — the loader synthesizes it. */
    content: string;
}
/**
 * The bundled skill set. Order matters only for the iteration order of
 * \`listAllSkills\`; lookups are name-keyed.
 */
export declare const BUNDLED_SKILLS: Readonly<Record<string, BundledSkill>>;
/**
 * Bump on every change to any bundled skill's content. Tests assert the
 * version so a content edit that forgets to bump is caught at CI time.
 */
export declare const BUNDLED_SKILLS_VERSION = "1.1.0";
/**
 * All bundled skill names, in a stable order (insertion order — TS preserves
 * the literal order of the Object.freeze call above).
 */
export declare const BUNDLED_SKILL_NAMES: readonly string[];
//# sourceMappingURL=skills.d.ts.map