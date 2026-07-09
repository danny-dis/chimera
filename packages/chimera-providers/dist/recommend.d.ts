/**
 * Smart per-role model recommendation.
 *
 * Given the models a user can actually reach (keys present / providers
 * configured), pick the best model for each agent role:
 *
 *   writer     → strongest (reasoning > frontier > mid > cheap)
 *   reviewer   → strongest available (a second set of eyes on the writer's output)
 *   challenger → a different, solid model (mid preferred; falls back to
 *                the writer model when only one is available)
 *
 * This is the engine behind "Chimera smartly auto-populates each role" — the
 * user can accept the recommendation or override per role in the TUI/CLI/config.
 */
import type { ModelEntry } from './model-registry.js';
export type ConfigProviderRole = 'writer' | 'reviewer' | 'challenger';
export interface RoleModels {
    writer: string;
    reviewer: string;
    challenger: string;
}
/** Highest-tier entry first; ties broken by larger context window. */
export declare function rankByTier(entries: ModelEntry[]): ModelEntry[];
/**
 * Recommend a model id per role from the given candidate pool.
 * Candidates are typically the models reachable with the user's keys
 * (a subset of the global registry). If `pool` is empty we fall back to
 * the full registry so callers always get a sane default.
 *
 * @param pool   Models the user can actually use.
 * @param roles  Which roles to populate (default: all three).
 */
export declare function recommendRoleModels(pool: ModelEntry[], roles?: ConfigProviderRole[]): Partial<RoleModels>;
/**
 * Convenience: recommend roles from the full registry filtered by provider.
 * Pass the provider names the user has keys for (e.g. ['anthropic','openai']).
 */
export declare function recommendFromProviders(providers: string[], roles?: ConfigProviderRole[]): Partial<RoleModels>;
//# sourceMappingURL=recommend.d.ts.map