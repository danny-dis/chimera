/**
 * Model capability inference — derives `tier` and `specialties` from
 * model name patterns so callers don't need to configure them manually.
 *
 * The pattern list is intentionally short and high-signal. Unknown
 * models fall back to `mid` / `general` (safe default).
 */

import type { SubTaskType, ModelCapability } from './types.js';

type Tier = ModelCapability['tier'];

interface PatternEntry {
  match: RegExp;
  tier: Tier;
  specialties: SubTaskType[];
}

/**
 * Ordered list of regex → capability mappings. First match wins.
 * Patterns are case-insensitive.
 */
const PATTERNS: PatternEntry[] = [
  // ── Frontier reasoning / code models ──────────────────────────
  {
    match: /gpt-4o(?!-mini)|o3|o4|claude-3\.5-sonnet|claude-4|claude-opus|gemini.*pro|deepseek.*r1|deepseek.*v3|qwen.*max|mistral-large|codestral/i,
    tier: 'frontier',
    specialties: ['reasoning', 'code_generation', 'code_review', 'analysis'],
  },

  // ── Mid-tier all-rounders ────────────────────────────────────
  {
    match: /gpt-4o-mini|claude-3-haiku|claude-3\.5-haiku|gemini.*flash(?!.*lite)|llama-3\.1-(70|405)|mistral-medium|sonnet|grok-3/i,
    tier: 'mid',
    specialties: ['general', 'summarization', 'code_generation', 'research'],
  },

  // ── Cheap / fast models ──────────────────────────────────────
  {
    match: /gemini.*flash.*lite|gpt-3\.5|llama-3\.1-(8b|70b)|mistral-small|qwen.*7b|qwen.*14b|phi-3|phind|deepseek.*lite|haiku/i,
    tier: 'cheap',
    specialties: ['summarization', 'general'],
  },
];

const FALLBACK_COST_PER_MILLION: Record<Tier, { input: number; output: number }> = {
  frontier: { input: 0.03, output: 0.06 },
  reasoning: { input: 0.05, output: 0.10 },
  mid:      { input: 0.01, output: 0.03 },
  cheap:    { input: 0.001, output: 0.003 },
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
export function inferCapabilities(modelId: string): ModelCapability {
  for (const p of PATTERNS) {
    if (p.match.test(modelId)) {
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
export function buildPool(
  modelIds: string[],
  opts?: { preferFrontierForJudge?: boolean },
): import('./types.js').ModelPool {
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
export function coreToolsForTier(tier: Tier): string[] {
  if (tier === 'cheap') {
    return ['read_file', 'search_files', 'write_file', 'edit_file', 'terminal', 'ask'];
  }
  return ['*'];
}

/** Budget constraints for a given tier. */
export interface ContextBudget {
  /** Maximum characters a single tool output may contribute before truncation. */
  maxToolOutputChars: number;
  /** Approximate token ceiling for the context window. */
  maxContextTokens: number;
  /** Character count after which tool output is truncated with an ellipsis marker. */
  truncationChars: number;
}

const BUDGETS: Record<Tier, ContextBudget> = {
  cheap:     { maxToolOutputChars: 1500,  maxContextTokens: 32000,  truncationChars: 120 },
  mid:       { maxToolOutputChars: 4000,  maxContextTokens: 120000, truncationChars: 200 },
  frontier:  { maxToolOutputChars: 8000,  maxContextTokens: 200000, truncationChars: 200 },
  reasoning: { maxToolOutputChars: 8000,  maxContextTokens: 200000, truncationChars: 200 },
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
export function contextBudgetForTier(tier: Tier): ContextBudget {
  return { ...BUDGETS[tier] };
}
