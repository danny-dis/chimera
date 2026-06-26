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
type ThinkingConfig = Record<string, unknown>;
/** Reserved tier names — cannot be used as custom alias names */
export declare const TIER_NAMES: readonly ["small", "medium", "large"];
export type TierName = (typeof TIER_NAMES)[number];
/** A model preset — provider + model string + optional provider-specific options */
export interface ModelAliasPreset {
    provider: string;
    model: string;
    effort?: string;
    thinking?: ThinkingConfig;
}
/** Alias entry as written in config YAML — user-defined @custom aliases.
 * Structurally identical to ModelAliasPreset; kept separate to distinguish
 * config-layer input from resolved output. */
export interface RawAliasEntry {
    provider: string;
    model: string;
    effort?: string;
    thinking?: ThinkingConfig;
}
/** The aliases map from config YAML — keyed by alias name */
export type RawAliasesConfig = Record<string, RawAliasEntry>;
/** The tiers map from config YAML — keyed by small/medium/large */
export type RawTiersConfig = Partial<Record<TierName, RawAliasEntry>>;
/** The resolved AI profile — used by resolveModelSpec */
export interface ResolvedAiProfile {
    defaultProvider: string;
    /** Fully resolved alias map: includes tier entries (small/medium/large) + @custom entries */
    aliases: Record<string, ModelAliasPreset>;
}
/** What resolveModelSpec returns */
export type ResolvedModelSpec = ModelAliasPreset | {
    literal: string;
};
/** True when `value` is one of the reserved tier keywords (small/medium/large). */
export declare function isTierName(value: string): value is TierName;
export interface BuildAiProfileOptions {
    /** Tier overrides from ~/.archon/config.yaml */
    globalTiers?: RawTiersConfig;
    /** Tier overrides from .archon/config.yaml (repo) — override globalTiers on key collision */
    repoTiers?: RawTiersConfig;
    /** Aliases from ~/.archon/config.yaml */
    globalAliases?: RawAliasesConfig;
    /** Aliases from .archon/config.yaml (repo) — override globalAliases on key collision */
    repoAliases?: RawAliasesConfig;
    /** Per-user tier overrides (DB) — highest precedence, override repoTiers on key collision */
    userTiers?: RawTiersConfig;
    /** Per-user aliases (DB) — highest precedence, override repoAliases on key collision */
    userAliases?: RawAliasesConfig;
}
/**
 * Build a ResolvedAiProfile by layering tier defaults → global tiers → repo tiers
 * → per-user tiers → global aliases → repo aliases → per-user aliases.
 * Throws if any alias name collides with a reserved tier name, or if an alias
 * entry has an empty provider or model string, or if an alias key lacks the `@` prefix.
 */
export declare function buildAiProfile(defaultProvider: string, options?: BuildAiProfileOptions): ResolvedAiProfile;
/**
 * Resolve a tier ref against the profile, reporting WHICH tier in the
 * fallback chain actually matched — `matchedTier !== requested` means the
 * requested tier is unset and a sibling preset was used. Callers that want
 * to surface a non-blocking "tier fell back" nudge use this; everything
 * else keeps the simpler {@link resolveModelSpec}.
 */
export declare function resolveTierWithFallback(profile: ResolvedAiProfile, tier: TierName): {
    preset: ModelAliasPreset;
    matchedTier: TierName;
};
/**
 * Classify a `model:` reference and resolve it against the profile.
 *   - tier ('small' | 'medium' | 'large') → preset via fallback chain
 *   - '@<name>' → preset from profile.aliases, or throw if unknown
 *   - anything else → { literal: ref } pass-through
 */
export declare function resolveModelSpec(profile: ResolvedAiProfile, ref: string): ResolvedModelSpec;
/** Type guard — narrows ResolvedModelSpec to its `{ literal }` variant. */
export declare function isLiteralSpec(spec: ResolvedModelSpec): spec is {
    literal: string;
};
/** Effort vocabularies per provider. Claude uses the generic node `effort`;
 *  Codex uses `modelReasoningEffort` (distinct enum). */
export declare const CLAUDE_EFFORTS: ReadonlySet<string>;
export declare const CODEX_REASONING_EFFORTS: ReadonlySet<string>;
/** Where a preset's `effort` should land for the resolved provider. */
export type EffortRouting = {
    field: 'effort';
    value: string;
} | {
    field: 'modelReasoningEffort';
    value: string;
};
/**
 * Route a preset's `effort` to the field the resolved provider understands —
 * Claude's generic node `effort` or Codex's `modelReasoningEffort`. Returns
 * `null` when the value isn't valid for that provider (e.g. a cross-provider
 * mismatch like `effort: 'max'` on Codex); callers MUST surface that rather
 * than silently dropping it. Single source of truth for both the DAG executor
 * and the chat orchestrator.
 */
export declare function routePresetEffort(provider: string, effort: string): EffortRouting | null;
/**
 * The effort vocabulary for a provider, or `null` if the provider has no known
 * effort concept (Pi/OpenRouter/Copilot/OpenCode — effort doesn't route there).
 * Lets the tier-config write path (route + CLI) validate `effort` UP FRONT
 * instead of letting `routePresetEffort` silently drop an unknown value at run
 * time (so `--effort ultra` errors instead of succeeding with no effect).
 */
export declare function validEffortsForProvider(provider: string): readonly string[] | null;
/**
 * True if `effort` is acceptable for `provider`. Providers WITHOUT a known
 * effort vocabulary accept any value (we don't block what we can't validate;
 * it's a no-op for them, not an error).
 */
export declare function isEffortValidForProvider(provider: string, effort: string): boolean;
export {};
//# sourceMappingURL=model-validation.d.ts.map