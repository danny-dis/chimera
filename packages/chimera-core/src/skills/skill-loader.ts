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
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { Mode } from '../types/agent.js';
import { SKILL_BUNDLES } from './skill-bundles.js';
import { parseSkillPack, resolveSkillPack } from './skill-pack.js';
import { BUNDLED_SKILLS } from './bundled/skills.js';

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
  /** File path patterns that trigger this skill. Glob syntax: *, **, ?. Omitted = always active. */
  paths?: string[];
  /** Tools this skill is allowed to use. Omitted = unrestricted. */
  allowedTools?: string[];
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
  /** File path patterns that trigger this skill. Empty = always active. */
  paths: string[];
  /** Tools this skill is allowed to use. Empty = unrestricted. */
  allowedTools: string[];
}

/** A pack record returned by `loadSkillsForMode` — content + provenance. */
export interface SkillRecord {
  name: string;
  content: string;
  source: SkillSource;
}

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
export function parseSkillFile(raw: string): { frontmatter: SkillFrontmatter; body: string } {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }
  const [, yamlText, body] = match;
  let frontmatter: SkillFrontmatter = {};
  try {
    const parsed = parseYaml(yamlText) as Record<string, unknown> | null;
    if (parsed && typeof parsed === 'object') {
      const name = parsed.name;
      if (typeof name === 'string' && name.length > 0) {
        frontmatter = {
          name,
          description: typeof parsed.description === 'string' ? parsed.description : undefined,
          inputs: isStringRecord(parsed.inputs) ? parsed.inputs : undefined,
          modes: Array.isArray(parsed.modes) ? parsed.modes.filter((m: unknown) => typeof m === 'string') : undefined,
          paths: Array.isArray(parsed.paths) ? parsed.paths.filter((p: unknown) => typeof p === 'string') : undefined,
          allowedTools: Array.isArray(parsed.allowedTools) ? parsed.allowedTools.filter((t: unknown) => typeof t === 'string') : undefined,
        };
      }
    }
  } catch {
    // Frontmatter parse failure → treat as no frontmatter, keep full raw body.
    return { frontmatter: {}, body: raw };
  }
  return { frontmatter, body };
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  for (const value of Object.values(v)) {
    if (typeof value !== 'string') return false;
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
export function buildInputsSchema(inputs: Record<string, string> | undefined): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  if (!inputs) {
    return z.object({}).strict();
  }
  for (const [key, decl] of Object.entries(inputs)) {
    const optional = decl.trim().endsWith('?');
    const base = decl.trim().replace(/\?$/, '').trim();
    let zod: z.ZodTypeAny;
    switch (base) {
      case 'string':
        zod = z.string();
        break;
      case 'number':
        zod = z.number();
        break;
      case 'boolean':
        zod = z.boolean();
        break;
      case 'string[]':
        zod = z.array(z.string());
        break;
      case 'number[]':
        zod = z.array(z.number());
        break;
      default:
        throw new Error(
          `SkillLoader: unknown inputs type '${decl}' for key '${key}'. ` +
            'Supported: string, number, boolean, string[], number[] (suffix "?" for optional).'
        );
    }
    shape[key] = optional ? zod.optional() : zod;
  }
  return z.object(shape).strict();
}

// ---------------------------------------------------------------------------
// Deprecation shim
// ---------------------------------------------------------------------------

const warnedLegacyPaths = new Set<string>();

/**
 * Emit a one-time stderr warning that a legacy skill path is in use. Keyed
 * by the absolute path of the legacy file, so the same file is announced
 * once per process even if multiple skills live in the same directory.
 */
export function warnLegacySkillPath(legacyPath: string): void {
  if (warnedLegacyPaths.has(legacyPath)) return;
  warnedLegacyPaths.add(legacyPath);
  process.stderr.write(
    `[chimera] DEPRECATION: reading skill from legacy path '${legacyPath}'. ` +
      "Move the file to '<workspace>/.chimera/skills/' or '~/.config/chimera/skills/'. " +
      'Legacy .kilo/ support will be removed in a future release.\n'
  );
}

/** Test-only helper: clear the deprecation guard between test cases. */
export function _resetLegacyWarnings(): void {
  warnedLegacyPaths.clear();
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

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
export function resolveSkillPath(skillName: string, workspaceRoot: string): ResolvedPath | null {
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const fileName = `${skillName}.md`;

  const candidates: Array<{ absPath: string; source: SkillSource; legacy: boolean }> = [
    { absPath: path.join(workspaceRoot, '.chimera', 'skills', fileName), source: 'workspace', legacy: false },
    { absPath: path.join(homeDir, '.config', 'chimera', 'skills', fileName), source: 'global', legacy: false },
    { absPath: path.join(workspaceRoot, '.kilo', 'skills', fileName), source: 'workspace', legacy: true },
    { absPath: path.join(homeDir, '.config', 'kilo', 'skills', fileName), source: 'global', legacy: true },
  ];

  for (const c of candidates) {
    if (existsSync(c.absPath)) {
      return c;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
export function loadSkill(
  skillName: string,
  workspaceRoot: string,
  options: LoadOptions = {}
): LoadedSkill | null {
  // 1. Bundled (in-memory, no fs).
  const bundled = BUNDLED_SKILLS[skillName];
  if (bundled) {
    return {
      name: bundled.name,
      description: bundled.description,
      content: bundled.content,
      source: 'bundled',
      path: `<bundled:${bundled.name}>`,
      inputsSchema: buildInputsSchema(undefined),
      modes: bundled.modes.includes('all') ? ['all'] : [...bundled.modes],
      paths: [],
      allowedTools: [],
    };
  }

  // 2-5. Disk paths.
  const resolved = resolveSkillPath(skillName, workspaceRoot);
  if (!resolved) return null;

  if (resolved.legacy && options.warnOnLegacy !== false) {
    warnLegacySkillPath(resolved.absPath);
  }

  const raw = readFileSync(resolved.absPath, 'utf-8');
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
    paths: frontmatter.paths ?? [],
    allowedTools: frontmatter.allowedTools ?? [],
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
export function loadSkillsForMode(opts: {
  mode: Mode;
  workspaceRoot: string;
  eventStream?: import('../event-stream.js').EventStream;
}): Array<SkillRecord> {
  const { mode, workspaceRoot, eventStream } = opts;
  const out: SkillRecord[] = [];
  const seen = new Set<string>();

  // 1) Static bundle
  for (const name of SKILL_BUNDLES[mode] ?? []) {
    const loaded = loadSkill(name, workspaceRoot, { warnOnLegacy: true });
    if (!loaded) continue;
    if (seen.has(loaded.name)) continue;
    seen.add(loaded.name);
    out.push({ name: loaded.name, content: loaded.content, source: loaded.source });
    emitSkillLoaded(eventStream, loaded.name, loaded.source, loaded.content.length);
  }

  // 2) Pack (if present). Pack entries OVERRIDE bundle entries with the
  // same name (the pack version wins on `source`). New names are appended.
  const packPath = path.join(workspaceRoot, '.chimera', 'skill-packs', `${mode}.md`);
  if (existsSync(packPath)) {
    try {
      const raw = readFileSync(packPath, 'utf-8');
      const pack = parseSkillPack(raw);
      for (const name of pack.skills) {
        const loaded = loadSkill(name, workspaceRoot, { warnOnLegacy: true });
        if (!loaded) continue;
        const existingIdx = out.findIndex((s) => s.name === loaded.name);
        if (existingIdx >= 0) {
          out[existingIdx] = { name: loaded.name, content: loaded.content, source: 'pack' };
        } else {
          out.push({ name: loaded.name, content: loaded.content, source: 'pack' });
        }
        emitSkillLoaded(eventStream, loaded.name, 'pack', loaded.content.length);
      }
    } catch {
      // Pack parse error → silently skip the pack. The bundle still loaded.
    }
  }

  // 3) Workspace skills — scan .chimera/skills/ for mode-matching skills
  const workspaceSkillsDir = path.join(workspaceRoot, '.chimera', 'skills');
  if (existsSync(workspaceSkillsDir)) {
    try {
      const files = readdirSync(workspaceSkillsDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const skillName = file.replace(/\.md$/, '');
        if (seen.has(skillName)) continue; // already loaded by bundle or pack

        const loaded = loadSkill(skillName, workspaceRoot, { warnOnLegacy: false });
        if (!loaded) continue;

        // Only load if modes include current mode or 'all'
        if (loaded.modes.includes('all') || loaded.modes.includes(mode)) {
          seen.add(skillName);
          out.push({ name: loaded.name, content: loaded.content, source: loaded.source });
          emitSkillLoaded(eventStream, loaded.name, loaded.source, loaded.content.length);
        }
      }
    } catch {
      // Directory read failure → not an error, continue with what we have.
    }
  }

  return out;
}

function emitSkillLoaded(
  eventStream: import('../event-stream.js').EventStream | undefined,
  skillName: string,
  source: 'workspace' | 'global' | 'pack' | 'bundled',
  bytes: number
): void {
  if (!eventStream) return;
  try {
    eventStream.append({ type: 'skill_loaded', skillName, source, bytes });
  } catch {
    // EventStream is best-effort telemetry; never crash prompt building.
  }
}

// ---------------------------------------------------------------------------
// Path pattern matching
// ---------------------------------------------------------------------------

/**
 * Check if a file path matches any of the given glob-like patterns.
 * Supports: *, **, ? wildcards. Simple implementation without external deps.
 *
 * - `*` matches any characters except `/`
 * - `**` matches any characters including `/`
 * - `?` matches exactly one character except `/`
 */
export function matchesPathPatterns(filePath: string, patterns: string[]): boolean {
  if (patterns.length === 0) return true;
  const normalized = filePath.replace(/\\/g, '/');
  return patterns.some((pattern) => matchesSinglePattern(normalized, pattern.replace(/\\/g, '/')));
}

function matchesSinglePattern(filePath: string, pattern: string): boolean {
  const regex = globToRegex(pattern);
  return regex.test(filePath);
}

function globToRegex(glob: string): RegExp {
  let regexStr = '^';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        regexStr += '.*';
        i += 2;
        if (glob[i] === '/') i++;
      } else {
        regexStr += '[^/]*';
        i++;
      }
    } else if (c === '?') {
      regexStr += '[^/]';
      i++;
    } else if (c === '.') {
      regexStr += '\\.';
      i++;
    } else {
      regexStr += c;
      i++;
    }
  }
  regexStr += '$';
  return new RegExp(regexStr);
}

// Re-export resolveSkillPack for convenience so callers that need the
// async variant can `import { resolveSkillPack } from '@chimera/core'`.
export { resolveSkillPack };

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
export function listAllSkills(workspaceRoot: string): LoadedSkill[] {
  const seen = new Set<string>();
  const out: LoadedSkill[] = [];
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';

  const dirs: Array<{ dir: string; source: SkillSource; legacy: boolean }> = [
    { dir: path.join(workspaceRoot, '.chimera', 'skills'), source: 'workspace', legacy: false },
    { dir: path.join(homeDir, '.config', 'chimera', 'skills'), source: 'global', legacy: false },
    { dir: path.join(workspaceRoot, '.kilo', 'skills'), source: 'workspace', legacy: true },
    { dir: path.join(homeDir, '.config', 'kilo', 'skills'), source: 'global', legacy: true },
  ];

  for (const { dir, source, legacy } of dirs) {
    if (!existsSync(dir)) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const name = entry.replace(/\.md$/, '');
      if (seen.has(name)) continue;
      seen.add(name);
      const abs = path.join(dir, entry);
      if (legacy) {
        warnLegacySkillPath(abs);
      }
      const raw = readFileSync(abs, 'utf-8');
      const { frontmatter, body } = parseSkillFile(raw);
      out.push({
        name: frontmatter.name ?? name,
        description: frontmatter.description ?? '',
        content: body,
        source,
        path: abs,
        inputsSchema: buildInputsSchema(frontmatter.inputs),
        modes: frontmatter.modes ?? ['all'],
        paths: frontmatter.paths ?? [],
        allowedTools: frontmatter.allowedTools ?? [],
      });
    }
  }
  return out;
}
