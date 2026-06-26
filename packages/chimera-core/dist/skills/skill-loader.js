"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSkillPack = void 0;
exports.parseSkillFile = parseSkillFile;
exports.buildInputsSchema = buildInputsSchema;
exports.warnLegacySkillPath = warnLegacySkillPath;
exports._resetLegacyWarnings = _resetLegacyWarnings;
exports.resolveSkillPath = resolveSkillPath;
exports.loadSkill = loadSkill;
exports.loadSkillsForMode = loadSkillsForMode;
exports.listAllSkills = listAllSkills;
/**
 * SkillLoader — synchronous loader for `.md` skill files with YAML frontmatter.
 *
 * A skill is a single Markdown file (`.md`) optionally prefixed with a YAML
 * frontmatter block that declares the skill's metadata. The minimal shape:
 *
 *   ---
 *   name: my-skill
 *   description: "..."
 *   ---
 *
 * Skills may also declare a typed `inputs` block that is converted to a Zod
 * schema for caller-side validation. If absent, the schema is
 * `z.object({}).strict()` (no args allowed).
 *
 * Path resolution (first match wins):
 *   1. <workspace>/.chimera/skills/<name>.md
 *   2. <home>/.config/chimera/skills/<name>.md
 *   3. <workspace>/.kilo/skills/<name>.md       (legacy shim, deprecation)
 *   4. <home>/.config/kilo/skills/<name>.md     (legacy shim, deprecation)
 *
 * The legacy `.kilo/` paths exist for backward compatibility. When the new
 * path is absent but the legacy one is present, the loader reads from the
 * legacy location and emits a one-time stderr warning. The guard is a
 * module-level `Set` keyed by absolute path so each legacy location is
 * announced at most once per process.
 *
 * The loader is sync (uses `readFileSync` + `existsSync`) because it is
 * called from `buildMessages` in `prompts.ts`, which is itself sync. The
 * `skill` tool in `chimera-tools` continues to use its own sync copy of
 * the same logic — the two layers do not share code per the no-circular
 * dependency rule (chimera-core must not import from chimera-tools).
 */
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const yaml_1 = require("yaml");
const zod_1 = require("zod");
const skill_bundles_js_1 = require("./skill-bundles.js");
const skill_pack_js_1 = require("./skill-pack.js");
Object.defineProperty(exports, "resolveSkillPack", { enumerable: true, get: function () { return skill_pack_js_1.resolveSkillPack; } });
const skills_js_1 = require("./bundled/skills.js");
// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
/**
 * Parse a Markdown file with optional YAML frontmatter.
 *
 * Returns `{ frontmatter, body }`. If the file has no frontmatter, returns
 * an empty frontmatter and the full content as `body`. The body is stripped
 * of the leading frontmatter block (and a single trailing newline if present).
 */
function parseSkillFile(raw) {
    const match = FRONTMATTER_RE.exec(raw);
    if (!match) {
        return { frontmatter: {}, body: raw };
    }
    const [, yamlText, body] = match;
    let frontmatter = {};
    try {
        const parsed = (0, yaml_1.parse)(yamlText);
        if (parsed && typeof parsed === 'object') {
            const name = parsed.name;
            if (typeof name === 'string' && name.length > 0) {
                frontmatter = {
                    name,
                    description: typeof parsed.description === 'string' ? parsed.description : undefined,
                    inputs: isStringRecord(parsed.inputs) ? parsed.inputs : undefined,
                    modes: Array.isArray(parsed.modes) ? parsed.modes.filter((m) => typeof m === 'string') : undefined,
                };
            }
        }
    }
    catch {
        // Frontmatter parse failure → treat as no frontmatter, keep full raw body.
        return { frontmatter: {}, body: raw };
    }
    return { frontmatter, body };
}
function isStringRecord(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        return false;
    for (const value of Object.values(v)) {
        if (typeof value !== 'string')
            return false;
    }
    return true;
}
// ---------------------------------------------------------------------------
// Zod schema derivation from `inputs:` declaration
// ---------------------------------------------------------------------------
/**
 * Supported scalar type tokens in the `inputs:` block.
 *   string        → z.string()
 *   number        → z.number()
 *   boolean       → z.boolean()
 *   string[]      → z.array(z.string())
 *   number[]      → z.array(z.number())
 *   <name>?       → optional variant of any of the above
 */
function buildInputsSchema(inputs) {
    const shape = {};
    if (!inputs) {
        return zod_1.z.object({}).strict();
    }
    for (const [key, decl] of Object.entries(inputs)) {
        const optional = decl.trim().endsWith('?');
        const base = decl.trim().replace(/\?$/, '').trim();
        let zod;
        switch (base) {
            case 'string':
                zod = zod_1.z.string();
                break;
            case 'number':
                zod = zod_1.z.number();
                break;
            case 'boolean':
                zod = zod_1.z.boolean();
                break;
            case 'string[]':
                zod = zod_1.z.array(zod_1.z.string());
                break;
            case 'number[]':
                zod = zod_1.z.array(zod_1.z.number());
                break;
            default:
                throw new Error(`SkillLoader: unknown inputs type '${decl}' for key '${key}'. ` +
                    'Supported: string, number, boolean, string[], number[] (suffix "?" for optional).');
        }
        shape[key] = optional ? zod.optional() : zod;
    }
    return zod_1.z.object(shape).strict();
}
// ---------------------------------------------------------------------------
// Deprecation shim
// ---------------------------------------------------------------------------
const warnedLegacyPaths = new Set();
/**
 * Emit a one-time stderr warning that a legacy skill path is in use. Keyed
 * by the absolute path of the legacy file, so the same file is announced
 * once per process even if multiple skills live in the same directory.
 */
function warnLegacySkillPath(legacyPath) {
    if (warnedLegacyPaths.has(legacyPath))
        return;
    warnedLegacyPaths.add(legacyPath);
    process.stderr.write(`[chimera] DEPRECATION: reading skill from legacy path '${legacyPath}'. ` +
        "Move the file to '<workspace>/.chimera/skills/' or '~/.config/chimera/skills/'. " +
        'Legacy .kilo/ support will be removed in a future release.\n');
}
/** Test-only helper: clear the deprecation guard between test cases. */
function _resetLegacyWarnings() {
    warnedLegacyPaths.clear();
}
/**
 * Resolve the on-disk path for a named skill. Returns `null` if the skill
 * is not installed in any known location. The `legacy` flag indicates the
 * caller should emit a deprecation warning after a successful read.
 */
function resolveSkillPath(skillName, workspaceRoot) {
    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    const fileName = `${skillName}.md`;
    const candidates = [
        { absPath: path_1.default.join(workspaceRoot, '.chimera', 'skills', fileName), source: 'workspace', legacy: false },
        { absPath: path_1.default.join(homeDir, '.config', 'chimera', 'skills', fileName), source: 'global', legacy: false },
        { absPath: path_1.default.join(workspaceRoot, '.kilo', 'skills', fileName), source: 'workspace', legacy: true },
        { absPath: path_1.default.join(homeDir, '.config', 'kilo', 'skills', fileName), source: 'global', legacy: true },
    ];
    for (const c of candidates) {
        if ((0, fs_1.existsSync)(c.absPath)) {
            return c;
        }
    }
    return null;
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
function loadSkill(skillName, workspaceRoot, options = {}) {
    // 1. Bundled (in-memory, no fs).
    const bundled = skills_js_1.BUNDLED_SKILLS[skillName];
    if (bundled) {
        return {
            name: bundled.name,
            description: bundled.description,
            content: bundled.content,
            source: 'bundled',
            path: `<bundled:${bundled.name}>`,
            inputsSchema: buildInputsSchema(undefined),
            modes: bundled.modes.includes('all') ? ['all'] : [...bundled.modes],
        };
    }
    // 2-5. Disk paths.
    const resolved = resolveSkillPath(skillName, workspaceRoot);
    if (!resolved)
        return null;
    if (resolved.legacy && options.warnOnLegacy !== false) {
        warnLegacySkillPath(resolved.absPath);
    }
    const raw = (0, fs_1.readFileSync)(resolved.absPath, 'utf-8');
    const { frontmatter, body } = parseSkillFile(raw);
    const name = frontmatter.name ?? skillName;
    const description = frontmatter.description ?? '';
    const inputsSchema = buildInputsSchema(frontmatter.inputs);
    return {
        name,
        description,
        content: body,
        source: resolved.source,
        path: resolved.absPath,
        inputsSchema,
        modes: frontmatter.modes ?? ['all'],
    };
}
// ---------------------------------------------------------------------------
// loadSkillsForMode — auto-load skill bundles for a given Mode
// ---------------------------------------------------------------------------
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
function loadSkillsForMode(opts) {
    const { mode, workspaceRoot, eventStream } = opts;
    const out = [];
    const seen = new Set();
    // 1) Static bundle
    for (const name of skill_bundles_js_1.SKILL_BUNDLES[mode] ?? []) {
        const loaded = loadSkill(name, workspaceRoot, { warnOnLegacy: true });
        if (!loaded)
            continue;
        if (seen.has(loaded.name))
            continue;
        seen.add(loaded.name);
        out.push({ name: loaded.name, content: loaded.content, source: loaded.source });
        emitSkillLoaded(eventStream, loaded.name, loaded.source, loaded.content.length);
    }
    // 2) Pack (if present). Pack entries OVERRIDE bundle entries with the
    // same name (the pack version wins on `source`). New names are appended.
    const packPath = path_1.default.join(workspaceRoot, '.chimera', 'skill-packs', `${mode}.md`);
    if ((0, fs_1.existsSync)(packPath)) {
        try {
            const raw = (0, fs_1.readFileSync)(packPath, 'utf-8');
            const pack = (0, skill_pack_js_1.parseSkillPack)(raw);
            for (const name of pack.skills) {
                const loaded = loadSkill(name, workspaceRoot, { warnOnLegacy: true });
                if (!loaded)
                    continue;
                const existingIdx = out.findIndex((s) => s.name === loaded.name);
                if (existingIdx >= 0) {
                    out[existingIdx] = { name: loaded.name, content: loaded.content, source: 'pack' };
                }
                else {
                    out.push({ name: loaded.name, content: loaded.content, source: 'pack' });
                }
                emitSkillLoaded(eventStream, loaded.name, 'pack', loaded.content.length);
            }
        }
        catch {
            // Pack parse error → silently skip the pack. The bundle still loaded.
        }
    }
    // 3) Workspace skills — scan .chimera/skills/ for mode-matching skills
    const workspaceSkillsDir = path_1.default.join(workspaceRoot, '.chimera', 'skills');
    if ((0, fs_1.existsSync)(workspaceSkillsDir)) {
        try {
            const files = (0, fs_1.readdirSync)(workspaceSkillsDir);
            for (const file of files) {
                if (!file.endsWith('.md'))
                    continue;
                const skillName = file.replace(/\.md$/, '');
                if (seen.has(skillName))
                    continue; // already loaded by bundle or pack
                const loaded = loadSkill(skillName, workspaceRoot, { warnOnLegacy: false });
                if (!loaded)
                    continue;
                // Only load if modes include current mode or 'all'
                if (loaded.modes.includes('all') || loaded.modes.includes(mode)) {
                    seen.add(skillName);
                    out.push({ name: loaded.name, content: loaded.content, source: loaded.source });
                    emitSkillLoaded(eventStream, loaded.name, loaded.source, loaded.content.length);
                }
            }
        }
        catch {
            // Directory read failure → not an error, continue with what we have.
        }
    }
    return out;
}
function emitSkillLoaded(eventStream, skillName, source, bytes) {
    if (!eventStream)
        return;
    try {
        eventStream.append({ type: 'skill_loaded', skillName, source, bytes });
    }
    catch {
        // EventStream is best-effort telemetry; never crash prompt building.
    }
}
// ---------------------------------------------------------------------------
// listAllSkills — enumerate every installed skill across modes + packs
// ---------------------------------------------------------------------------
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
function listAllSkills(workspaceRoot) {
    const seen = new Set();
    const out = [];
    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    const dirs = [
        { dir: path_1.default.join(workspaceRoot, '.chimera', 'skills'), source: 'workspace', legacy: false },
        { dir: path_1.default.join(homeDir, '.config', 'chimera', 'skills'), source: 'global', legacy: false },
        { dir: path_1.default.join(workspaceRoot, '.kilo', 'skills'), source: 'workspace', legacy: true },
        { dir: path_1.default.join(homeDir, '.config', 'kilo', 'skills'), source: 'global', legacy: true },
    ];
    for (const { dir, source, legacy } of dirs) {
        if (!(0, fs_1.existsSync)(dir))
            continue;
        let entries;
        try {
            entries = (0, fs_1.readdirSync)(dir);
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.endsWith('.md'))
                continue;
            const name = entry.replace(/\.md$/, '');
            if (seen.has(name))
                continue;
            seen.add(name);
            const abs = path_1.default.join(dir, entry);
            if (legacy) {
                warnLegacySkillPath(abs);
            }
            const raw = (0, fs_1.readFileSync)(abs, 'utf-8');
            const { frontmatter, body } = parseSkillFile(raw);
            out.push({
                name: frontmatter.name ?? name,
                description: frontmatter.description ?? '',
                content: body,
                source,
                path: abs,
                inputsSchema: buildInputsSchema(frontmatter.inputs),
                modes: frontmatter.modes ?? ['all'],
            });
        }
    }
    return out;
}
//# sourceMappingURL=skill-loader.js.map