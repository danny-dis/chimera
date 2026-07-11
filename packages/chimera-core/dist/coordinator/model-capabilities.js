"use strict";
/**
 * Model capability inference — derives `tier` and `specialties` from
 * model name patterns so callers don't need to configure them manually.
 *
 * The pattern list is intentionally short and high-signal. Unknown
 * models fall back to `mid` / `general` (safe default).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferCapabilities = inferCapabilities;
exports.buildPool = buildPool;
exports.coreToolsForTier = coreToolsForTier;
exports.contextBudgetForTier = contextBudgetForTier;
/**
 * Ordered list of regex → capability mappings. First match wins.
 * Patterns are case-insensitive.
 */
const PATTERNS = [
    // ── Reasoning / search models ────────────────────────────────
    {
        match: /sonar|sonar-pro/i,
        tier: 'reasoning',
        specialties: ['reasoning', 'research', 'analysis'],
    },
    // ── Frontier reasoning / code models ──────────────────────────
    {
        match: /gpt-5(?!-mini|-nano)|o3|o4|gpt-4o(?!-mini)|claude-3\.5-sonnet|claude-4|claude-opus|claude-sonnet-4|gemini.*pro|gemini-3|grok-4(?!-fast)|grok-3|deepseek.*(v4|v3|r1)|llama-4-(maverick|opus)|llama-3\.1-405b|mistral-large|codestral|mistral-(medium|large)-3|mistral-large-2|qwen3-(235b|72b)|qwen.*max|qwen-2\.5-72b|command-a|command-r-plus|kimi-k2/i,
        tier: 'frontier',
        specialties: ['reasoning', 'code_generation', 'code_review', 'analysis'],
    },
    // ── Mid-tier all-rounders ────────────────────────────────────
    {
        match: /gpt-5-mini|gpt-5-nano|gpt-4o-mini|claude-3-haiku|claude-3\.5-haiku|claude-haiku-4|gemini.*flash(?!.*lite)|gemini-2\.5-flash|llama-4-scout|llama-3\.1-70b|mistral-medium|sonnet|grok-4-fast|qwen3-32b|qwen.*(32b|14b)|command-r7b|deepseek.*lite/i,
        tier: 'mid',
        specialties: ['general', 'summarization', 'code_generation', 'research'],
    },
    // ── Cheap / fast models ──────────────────────────────────────
    {
        match: /gemini.*flash.*lite|gpt-3\.5|llama-3\.1-8b|mistral-small|qwen.*(7b|14b)|phi-3|phind|haiku|deepseek.*v2/i,
        tier: 'cheap',
        specialties: ['summarization', 'general'],
    },
];
const FALLBACK_COST_PER_MILLION = {
    frontier: { input: 0.03, output: 0.06 },
    reasoning: { input: 0.05, output: 0.10 },
    mid: { input: 0.01, output: 0.03 },
    cheap: { input: 0.001, output: 0.003 },
};
/**
 * Infer model capabilities from the model ID string.
 *
 * ```ts
 * inferCapabilities('gpt-4o')        → { tier: 'frontier', specialties: ['reasoning', ...] }
 * inferCapabilities('gemini-2.5-flash') → { tier: 'mid', specialties: ['general', ...] }
 * inferCapabilities('unknown-model')  → { tier: 'mid', specialties: ['general'] }
 * ```
 */
function inferCapabilities(modelId) {
    // Strip an optional `provider/` prefix (e.g. `xai/grok-4` → `grok-4`)
    // so provider-qualified IDs still match on their model substring.
    const lookupId = modelId.replace(/^[^/]+\//, '');
    for (const p of PATTERNS) {
        if (p.match.test(lookupId)) {
            const cost = FALLBACK_COST_PER_MILLION[p.tier];
            return {
                modelId,
                tier: p.tier,
                specialties: p.specialties,
                costPerMillionInput: cost.input,
                costPerMillionOutput: cost.output,
            };
        }
    }
    // Unknown model → safe mid-tier generalist default
    return {
        modelId,
        tier: 'mid',
        specialties: ['general'],
        costPerMillionInput: FALLBACK_COST_PER_MILLION.mid.input,
        costPerMillionOutput: FALLBACK_COST_PER_MILLION.mid.output,
    };
}
/**
 * Build a `ModelPool` from a list of model IDs by inferring each one's
 * capabilities. Convenience for callers that have model IDs but no
 * capability metadata.
 */
function buildPool(modelIds, opts) {
    return {
        models: modelIds.map(inferCapabilities),
        preferFrontierForJudge: opts?.preferFrontierForJudge ?? true,
    };
}
/**
 * Return the set of core tool names a model of the given `tier` should
 * be allowed to use.
 *
 * - `cheap` → a small, high-signal subset (no expensive tools).
 * - `mid` / `frontier` / `reasoning` → `['*']` (all tools).
 *
 * ```ts
 * coreToolsForTier('cheap')     → ['read_file', 'search_files', 'write_file', 'edit_file', 'terminal', 'ask']
 * coreToolsForTier('frontier')  → ['*']
 * coreToolsForTier('mid')       → ['*']
 * ```
 */
function coreToolsForTier(tier) {
    if (tier === 'cheap') {
        return ['read_file', 'search_files', 'write_file', 'edit_file', 'terminal', 'ask'];
    }
    return ['*'];
}
const BUDGETS = {
    cheap: { maxToolOutputChars: 1500, maxContextTokens: 32000, truncationChars: 120 },
    mid: { maxToolOutputChars: 4000, maxContextTokens: 120000, truncationChars: 200 },
    frontier: { maxToolOutputChars: 8000, maxContextTokens: 200000, truncationChars: 200 },
    reasoning: { maxToolOutputChars: 8000, maxContextTokens: 200000, truncationChars: 200 },
};
/**
 * Return the context budget for a model of the given `tier`.
 *
 * Budgets establish a strict ordering: `cheap < mid < frontier === reasoning`.
 * Downstream consumers (orchestrator, harness) read these caps to decide
 * how much context to feed a model.
 *
 * ```ts
 * contextBudgetForTier('cheap').maxContextTokens     // 32000
 * contextBudgetForTier('frontier').maxToolOutputChars // 8000
 * ```
 */
function contextBudgetForTier(tier) {
    return { ...BUDGETS[tier] };
}
//# sourceMappingURL=model-capabilities.js.map