import { z } from 'zod';
import type { Mode } from '../types/agent.js';
import { resolveSkillPack } from './skill-pack.js';
/** Source location of a skill — used for telemetry. */
export type SkillSource = 'bundled' | 'workspace' | 'global' | 'pack';
/** Frontmatter shape for a skill. */
export interface SkillFrontmatter {
    /** Skill name. Optional at the type level because a skill may have no frontmatter at all; the loader falls back to the file's basename in that case. */
    name?: string;
    description?: string;
    /** Optional typed inputs — converted to a Zod schema for caller validation. */
    inputs?: Record<string, string>;
    /** Modes this skill applies to. ['all'] or omitted = every mode. */
    modes?: string[];
}
/** Result of loading a skill: raw content, parsed frontmatter, and source. */
export interface LoadedSkill {
    name: string;
    description: string;
    content: string;
    source: SkillSource;
    path: string;
    /** Zod schema derived from `frontmatter.inputs` (or strict-empty if absent). */
    inputsSchema: z.ZodTypeAny;
    /** Modes this skill applies to. ['all'] = every mode. */
    modes: string[];
}
/** A pack record returned by `loadSkillsForMode` — content + provenance. */
export interface SkillRecord {
    name: string;
    content: string;
    source: SkillSource;
}
/**
 * Parse a Markdown file with optional YAML frontmatter.
 *
 * Returns `{ frontmatter, body }`. If the file has no frontmatter, returns
 * an empty frontmatter and the full content as `body`. The body is stripped
 * of the leading frontmatter block (and a single trailing newline if present).
 */
export declare function parseSkillFile(raw: string): {
    frontmatter: SkillFrontmatter;
    body: string;
};
/**
 * Supported scalar type tokens in the `inputs:` block.
 *   string        → z.string()
 *   number        → z.number()
 *   boolean       → z.boolean()
 *   string[]      → z.array(z.string())
 *   number[]      → z.array(z.number())
 *   <name>?       → optional variant of any of the above
 */
export declare function buildInputsSchema(inputs: Record<string, string> | undefined): z.ZodTypeAny;
/**
 * Emit a one-time stderr warning that a legacy skill path is in use. Keyed
 * by the absolute path of the legacy file, so the same file is announced
 * once per process even if multiple skills live in the same directory.
 */
export declare function warnLegacySkillPath(legacyPath: string): void;
/** Test-only helper: clear the deprecation guard between test cases. */
export declare function _resetLegacyWarnings(): void;
interface ResolvedPath {
    absPath: string;
    source: SkillSource;
    legacy: boolean;
}
/**
 * Resolve the on-disk path for a named skill. Returns `null` if the skill
 * is not installed in any known location. The `legacy` flag indicates the
 * caller should emit a deprecation warning after a successful read.
 */
export declare function resolveSkillPath(skillName: string, workspaceRoot: string): ResolvedPath | null;
export interface LoadOptions {
    /** Emit a deprecation warning if the resolved path is in the legacy `.kilo/` tree. */
    warnOnLegacy?: boolean;
}
/**
 * Load a single skill by name. Resolution order (first match wins):
 *   1. BUNDLED_SKILLS                 (ships with @chimera/core)
 *   2. <workspace>/.chimera/skills/   (per-project override)
 *   3. <home>/.config/chimera/skills/ (per-user override)
 *   4. <workspace>/.kilo/skills/      (legacy shim, deprecation warning)
 *   5. <home>/.config/kilo/skills/    (legacy shim, deprecation warning)
 *
 * Bundled skills can be overridden by dropping a same-named file into the
 * workspace skills dir. The bundled version is the default; the user copy
 * wins on lookup.
 *
 * Returns `null` if the skill is not installed in any known location.
 */
export declare function loadSkill(skillName: string, workspaceRoot: string, options?: LoadOptions): LoadedSkill | null;
/**
 * Look up the static skill bundle for `mode` and load each named skill from
 * the workspace / global skill dirs. If a `SKILL_PACK.md` exists at
 * `<workspace>/.chimera/skill-packs/<mode>.md`, its listed skills are
 * loaded AFTER the bundle with `source: 'pack'`.
 *
 * Resolution order (all missing entries are silently dropped):
 *   1. `SKILL_BUNDLES[mode]`        — `source: 'workspace' | 'global'`
 *   2. Pack for the mode (if any)   — `source: 'pack'`
 *   3. Workspace skills from `.chimera/skills/*.md` whose `modes` field
 *      includes the current mode (or `['all']`)
 *
 * Duplicate names: if a name appears in both the bundle and the pack, the
 * pack version wins (it is the only one emitted). Workspace skills are
 * skipped if already loaded by bundle or pack.
 *
 * Telemetry: for every emitted record, if `eventStream` is supplied, a
 * `skill_loaded` event is appended. Missing event stream is not an error.
 */
export declare function loadSkillsForMode(opts: {
    mode: Mode;
    workspaceRoot: string;
    eventStream?: import('../event-stream.js').EventStream;
}): Array<SkillRecord>;
export { resolveSkillPack };
/**
 * Enumerate every discoverable skill across all known directories. Unlike
 * `loadSkillsForMode`, this does NOT consult any per-mode bundle — it walks
 * the workspace and global skill dirs directly so the CLI can show the
 * full inventory in `chimera skill list`.
 *
 * Resolution order (first match wins per name):
 *   1. <workspace>/.chimera/skills/*.md
 *   2. <home>/.config/chimera/skills/*.md
 *   3. <workspace>/.kilo/skills/*.md   (legacy shim, deprecation)
 *   4. <home>/.config/kilo/skills/*.md (legacy shim, deprecation)
 *
 * Pack files (`.chimera/skill-packs/*.md`) are NOT included here — packs
 * are composition primitives, not standalone skills. They are loaded as
 * part of `loadSkillsForMode` when their `mode:` matches the active mode.
 */
export declare function listAllSkills(workspaceRoot: string): LoadedSkill[];
//# sourceMappingURL=skill-loader.d.ts.map