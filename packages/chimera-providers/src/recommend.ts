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
import { ModelRegistry } from './model-registry.js';

const ALL_MODELS: ModelEntry[] = new ModelRegistry().getAll();

export type ConfigProviderRole = 'writer' | 'reviewer' | 'challenger';

export interface RoleModels {
  writer: string;
  reviewer: string;
  challenger: string;
}

const TIER_RANK: Record<ModelEntry['tier'], number> = {
  reasoning: 3,
  frontier: 2,
  mid: 1,
  cheap: 0,
};

/** Highest-tier entry first; ties broken by larger context window. */
export function rankByTier(entries: ModelEntry[]): ModelEntry[] {
  return [...entries].sort((a, b) => {
    const t = TIER_RANK[b.tier] - TIER_RANK[a.tier];
    if (t !== 0) return t;
    return b.contextWindow - a.contextWindow;
  });
}

/**
 * Recommend a model id per role from the given candidate pool.
 * Candidates are typically the models reachable with the user's keys
 * (a subset of the global registry). If `pool` is empty we fall back to
 * the full registry so callers always get a sane default.
 *
 * @param pool   Models the user can actually use.
 * @param roles  Which roles to populate (default: all three).
 */
export function recommendRoleModels(
  pool: ModelEntry[],
  roles: ConfigProviderRole[] = ['writer', 'reviewer', 'challenger'],
): Partial<RoleModels> {
  const source = pool.length > 0 ? pool : ALL_MODELS;
  const ranked = rankByTier(source);

  // Strongest overall model.
  const best = ranked[0];
  // A second distinct model, if available, for the challenger's independent view.
  const second = ranked.find((m) => m.id !== best?.id);

  const out: Partial<RoleModels> = {};
  for (const role of roles) {
    if (role === 'challenger') {
      // Prefer a different model so the challenger isn't just echoing the writer.
      out.challenger = second?.id ?? best?.id ?? source[0]?.id ?? '';
    } else {
      out[role] = best?.id ?? source[0]?.id ?? '';
    }
  }
  return out;
}

/**
 * Convenience: recommend roles from the full registry filtered by provider.
 * Pass the provider names the user has keys for (e.g. ['anthropic','openai']).
 */
export function recommendFromProviders(
  providers: string[],
  roles: ConfigProviderRole[] = ['writer', 'reviewer', 'challenger'],
): Partial<RoleModels> {
  const pool = ALL_MODELS.filter((m) => providers.includes(m.provider));
  return recommendRoleModels(pool, roles);
}
