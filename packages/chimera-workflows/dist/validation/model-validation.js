"use strict";
/**
 * Model alias resolver — pure classification + lookup for workflow `model:` refs.
 *
 * Classifies a model reference string as one of:
 *   - tier keyword (`small` / `medium` / `large`) → looked up in profile with fallback chain
 *   - `@<name>` custom alias → looked up in profile, errors if unknown
 *   - bare literal (anything else) → returned unchanged for SDK pass-through
 *
 * No side effects, no logger, no I/O. The `ResolvedAiProfile` is built once by
 * `buildAiProfile()` from layered config (tier defaults → global tiers → repo
 * tiers → global aliases → repo aliases) and then handed to `resolveModelSpec()`
 * per call.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CODEX_REASONING_EFFORTS = exports.CLAUDE_EFFORTS = exports.TIER_NAMES = void 0;
exports.isTierName = isTierName;
exports.buildAiProfile = buildAiProfile;
exports.resolveTierWithFallback = resolveTierWithFallback;
exports.resolveModelSpec = resolveModelSpec;
exports.isLiteralSpec = isLiteralSpec;
exports.routePresetEffort = routePresetEffort;
exports.validEffortsForProvider = validEffortsForProvider;
exports.isEffortValidForProvider = isEffortValidForProvider;
// NOTE: tier-defaults.json is expected to be imported or handled in the new structure.
// For now, I will use a placeholder or assume it's available in the same relative path.
const tier_defaults_json_1 = __importDefault(require("../defaults/tier-defaults.json"));
/** Reserved tier names — cannot be used as custom alias names */
exports.TIER_NAMES = ['small', 'medium', 'large'];
/**
 * Per-tier fallback order. When a workflow asks for `large` but the install
 * has only `small` configured, we walk this chain and pick the first match.
 * Order rationale: prefer a "near miss" in capability over an unrelated tier,
 * but never throw when ANY tier alias exists.
 */
const TIER_FALLBACK = {
    large: ['large', 'medium', 'small'],
    medium: ['medium', 'large', 'small'], // prefer over-capable (large) when both sides missing
    small: ['small', 'medium', 'large'],
};
const TIER_DEFAULTS = tier_defaults_json_1.default;
/** True when `value` is one of the reserved tier keywords (small/medium/large). */
function isTierName(value) {
    return exports.TIER_NAMES.includes(value);
}
function assertNotReserved(name) {
    if (isTierName(name)) {
        throw new Error(`Alias name '${name}' is reserved (small/medium/large are tier keywords). Use a different name.`);
    }
}
function assertCustomAliasPrefix(name) {
    if (!name.startsWith('@')) {
        throw new Error(`Alias name '${name}' must start with '@' (e.g. '@${name}'). Reserved tier names (small/medium/large) do not need '@'.`);
    }
}
function assertValidEntry(name, entry) {
    if (typeof entry.provider !== 'string' || entry.provider.length === 0) {
        throw new Error(`Alias '${name}' has invalid provider — must be a non-empty string.`);
    }
    if (typeof entry.model !== 'string' || entry.model.length === 0) {
        throw new Error(`Alias '${name}' has invalid model — must be a non-empty string.`);
    }
}
function assertValidTierName(name) {
    if (!isTierName(name)) {
        throw new Error(`Tier name '${name}' is invalid. Supported tiers: ${exports.TIER_NAMES.join(', ')}.`);
    }
}
function toModelAliasPreset(entry) {
    return {
        provider: entry.provider,
        model: entry.model,
        ...(entry.effort !== undefined ? { effort: entry.effort } : {}),
        ...(entry.thinking !== undefined ? { thinking: entry.thinking } : {}),
    };
}
/**
 * Build a ResolvedAiProfile by layering tier defaults → global tiers → repo tiers
 * → per-user tiers → global aliases → repo aliases → per-user aliases.
 * Throws if any alias name collides with a reserved tier name, or if an alias
 * entry has an empty provider or model string, or if an alias key lacks the `@` prefix.
 */
function buildAiProfile(defaultProvider, options = {}) {
    const aliases = {};
    const tierEntries = TIER_DEFAULTS[defaultProvider];
    if (tierEntries) {
        for (const tier of exports.TIER_NAMES) {
            const entry = tierEntries[tier];
            if (entry) {
                aliases[tier] = {
                    provider: defaultProvider,
                    model: entry.model,
                    ...(entry.effort !== undefined ? { effort: entry.effort } : {}),
                };
            }
        }
    }
    for (const layer of [options.globalTiers, options.repoTiers, options.userTiers]) {
        if (!layer)
            continue;
        for (const [name, entry] of Object.entries(layer)) {
            assertValidTierName(name);
            assertValidEntry(name, entry);
            aliases[name] = toModelAliasPreset(entry);
        }
    }
    for (const layer of [options.globalAliases, options.repoAliases, options.userAliases]) {
        if (!layer)
            continue;
        for (const [name, entry] of Object.entries(layer)) {
            assertNotReserved(name);
            assertCustomAliasPrefix(name);
            assertValidEntry(name, entry);
            aliases[name] = toModelAliasPreset(entry);
        }
    }
    return { defaultProvider, aliases };
}
/**
 * Resolve a tier ref against the profile, reporting WHICH tier in the
 * fallback chain actually matched — `matchedTier !== requested` means the
 * requested tier is unset and a sibling preset was used. Callers that want
 * to surface a non-blocking "tier fell back" nudge use this; everything
 * else keeps the simpler {@link resolveModelSpec}.
 */
function resolveTierWithFallback(profile, tier) {
    for (const candidate of TIER_FALLBACK[tier]) {
        const preset = profile.aliases[candidate];
        if (preset)
            return { preset, matchedTier: candidate };
    }
    throw new Error(`Tier '${tier}' has no configured preset and no built-in default for provider '${profile.defaultProvider}'. Configure 'tiers.small/medium/large' in .archon/config.yaml.`);
}
/**
 * Classify a `model:` reference and resolve it against the profile.
 *   - tier ('small' | 'medium' | 'large') → preset via fallback chain
 *   - '@<name>' → preset from profile.aliases, or throw if unknown
 *   - anything else → { literal: ref } pass-through
 */
function resolveModelSpec(profile, ref) {
    if (isTierName(ref)) {
        return resolveTierWithFallback(profile, ref).preset;
    }
    if (ref.startsWith('@')) {
        const preset = profile.aliases[ref];
        if (preset)
            return preset;
        const defined = Object.keys(profile.aliases);
        const list = defined.length > 0 ? defined.join(', ') : '(none)';
        throw new Error(`Unknown alias '${ref}'. Defined aliases: ${list}`);
    }
    return { literal: ref };
}
/** Type guard — narrows ResolvedModelSpec to its `{ literal }` variant. */
function isLiteralSpec(spec) {
    return 'literal' in spec;
}
/** Effort vocabularies per provider. Claude uses the generic node `effort`;
 *  Codex uses `modelReasoningEffort` (distinct enum). */
exports.CLAUDE_EFFORTS = new Set(['low', 'medium', 'high', 'max']);
exports.CODEX_REASONING_EFFORTS = new Set([
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
]);
/**
 * Route a preset's `effort` to the field the resolved provider understands —
 * Claude's generic node `effort` or Codex's `modelReasoningEffort`. Returns
 * `null` when the value isn't valid for that provider (e.g. a cross-provider
 * mismatch like `effort: 'max'` on Codex); callers MUST surface that rather
 * than silently dropping it. Single source of truth for both the DAG executor
 * and the chat orchestrator.
 */
function routePresetEffort(provider, effort) {
    if (provider === 'claude' && exports.CLAUDE_EFFORTS.has(effort)) {
        return { field: 'effort', value: effort };
    }
    if (provider === 'codex' && exports.CODEX_REASONING_EFFORTS.has(effort)) {
        return { field: 'modelReasoningEffort', value: effort };
    }
    return null;
}
/**
 * The effort vocabulary for a provider, or `null` if the provider has no known
 * effort concept (Pi/OpenRouter/Copilot/OpenCode — effort doesn't route there).
 * Lets the tier-config write path (route + CLI) validate `effort` UP FRONT
 * instead of letting `routePresetEffort` silently drop an unknown value at run
 * time (so `--effort ultra` errors instead of succeeding with no effect).
 */
function validEffortsForProvider(provider) {
    if (provider === 'claude')
        return [...exports.CLAUDE_EFFORTS];
    if (provider === 'codex')
        return [...exports.CODEX_REASONING_EFFORTS];
    return null;
}
/**
 * True if `effort` is acceptable for `provider`. Providers WITHOUT a known
 * effort vocabulary accept any value (we don't block what we can't validate;
 * it's a no-op for them, not an error).
 */
function isEffortValidForProvider(provider, effort) {
    const valid = validEffortsForProvider(provider);
    return valid === null || valid.includes(effort);
}
//# sourceMappingURL=model-validation.js.map