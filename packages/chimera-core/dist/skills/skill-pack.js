"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSkillPack = parseSkillPack;
exports.resolveSkillPack = resolveSkillPack;
/**
 * SKILL_PACK — composition primitive for bundling multiple skills.
 *
 * A `SKILL_PACK.md` is a manifest that lists skill names to load together.
 * Format:
 *
 *   ---
 *   name: code-review-pack
 *   description: "Bundled skills for code review tasks"
 *   mode: code
 *   skills:
 *     - gitnexus-exploring
 *     - gitnexus-impact-analysis
 *     - gitnexus-refactoring
 *   ---
 *
 * `parseSkillPack` validates the frontmatter and returns a `SkillPack`
 * object. `resolveSkillPack` reads the named skills from the workspace +
 * global skill dirs and returns them with `source: 'pack'`. Missing skills
 * are silently skipped.
 *
 * Resolution order in `loadSkillsForMode` (see `skill-loader.ts` for the
 * orchestrator):
 *
 *   1. Static mode bundle (SKILL_BUNDLES[mode])         — `source: 'workspace' | 'global'`
 *   2. Pack for the mode (if SKILL_PACK.md exists)      — `source: 'pack'`
 *
 * Pack skills are listed AFTER bundle skills; duplicate names are kept
 * once (pack wins on `source`).
 */
const yaml_1 = require("yaml");
const skill_loader_js_1 = require("./skill-loader.js");
function isStringArray(v) {
    return Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length > 0);
}
/**
 * Parse the content of a `SKILL_PACK.md` file. Throws a descriptive error
 * if the frontmatter is missing required fields or has the wrong shape.
 */
function parseSkillPack(content) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
    if (!match) {
        throw new Error('parseSkillPack: missing YAML frontmatter (--- ... ---)');
    }
    let parsed;
    try {
        parsed = (0, yaml_1.parse)(match[1]);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`parseSkillPack: invalid YAML frontmatter: ${message}`);
    }
    const name = typeof parsed.name === 'string' ? parsed.name : '';
    const description = typeof parsed.description === 'string' ? parsed.description : '';
    const mode = typeof parsed.mode === 'string' ? parsed.mode : '';
    const skills = isStringArray(parsed.skills) ? parsed.skills : [];
    if (!name)
        throw new Error("parseSkillPack: 'name' is required");
    if (!mode)
        throw new Error("parseSkillPack: 'mode' is required");
    if (skills.length === 0)
        throw new Error("parseSkillPack: 'skills' must be a non-empty array");
    return { name, description, mode, skills };
}
/**
 * Resolve a `SkillPack` to a list of skill records. Each named skill is
 * read via `loadSkill`; missing skills are silently dropped. Every
 * returned record is tagged `source: 'pack'` regardless of where the
 * underlying file lives (workspace vs. global).
 */
async function resolveSkillPack(pack, workspaceRoot) {
    const records = [];
    for (const name of pack.skills) {
        const loaded = (0, skill_loader_js_1.loadSkill)(name, workspaceRoot, { warnOnLegacy: true });
        if (!loaded)
            continue; // silently skip missing
        records.push({
            name: loaded.name,
            content: loaded.content,
            source: 'pack',
        });
    }
    return records;
}
//# sourceMappingURL=skill-pack.js.map