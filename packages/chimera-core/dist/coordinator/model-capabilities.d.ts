/**
 * Model capability inference — derives `tier` and `specialties` from
 * model name patterns so callers don't need to configure them manually.
 *
 * The pattern list is intentionally short and high-signal. Unknown
 * models fall back to `mid` / `general` (safe default).
 */
import type { ModelCapability } from './types.js';
type Tier = ModelCapability['tier'];
/**
 * Infer model capabilities from the model ID string.
 *
 * ```ts
 * inferCapabilities('gpt-4o')        → { tier: 'frontier', specialties: ['reasoning', ...] }
 * inferCapabilities('gemini-2.5-flash') → { tier: 'mid', specialties: ['general', ...] }
 * inferCapabilities('unknown-model')  → { tier: 'mid', specialties: ['general'] }
 * ```
 */
export declare function inferCapabilities(modelId: string): ModelCapability;
/**
 * Build a `ModelPool` from a list of model IDs by inferring each one's
 * capabilities. Convenience for callers that have model IDs but no
 * capability metadata.
 */
export declare function buildPool(modelIds: string[], opts?: {
    preferFrontierForJudge?: boolean;
}): import('./types.js').ModelPool;
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
export declare function coreToolsForTier(tier: Tier): string[];
/** Budget constraints for a given tier. */
export interface ContextBudget {
    /** Maximum characters a single tool output may contribute before truncation. */
    maxToolOutputChars: number;
    /** Approximate token ceiling for the context window. */
    maxContextTokens: number;
    /** Character count after which tool output is truncated with an ellipsis marker. */
    truncationChars: number;
}
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
export declare function contextBudgetForTier(tier: Tier): ContextBudget;
export {};
//# sourceMappingURL=model-capabilities.d.ts.map