import { UserSkillModel, type SkillTier, type ObservedCapability, type ExplainDepth } from './user-skill-model.js';
/**
 * A message authored at three depths. `beginner` explains WHY, offers a safe
 * default, and avoids/defines jargon. `advanced` is terse, states action +
 * result, and surfaces the power-user shortcut. `intermediate` is the
 * default middle ground (used when evidence is thin).
 */
export interface TieredMessage {
    beginner: string;
    intermediate: string;
    advanced: string;
}
/** Resolve the right string for the current skill tier. */
export declare function tierMessage(msg: TieredMessage, tier: SkillTier): string;
/** Resolve by explanation depth (more explicit than tier). */
export declare function depthMessage(msg: TieredMessage, depth: ExplainDepth): string;
/**
 * Catalog of surfacable capabilities, with the copy for each tier and a flag
 * for whether it is more relevant to experts (automation/config/API) vs.
 * beginners (core workflow features).
 */
export interface CapabilityTip {
    id: ObservedCapability;
    /** Short label shown in logs / debugging. */
    label: string;
    /** Beginner copy: one concrete next step, no jargon pile-up. */
    beginner: string;
    /** Advanced copy: terse, points at the config/API surface. */
    advanced: string;
    /** True if this is primarily an expert/automation capability. */
    expertOriented: boolean;
}
export declare const CAPABILITY_TIPS: Record<ObservedCapability, CapabilityTip>;
export interface ValueSuggestion {
    id: ObservedCapability;
    tip: string;
    /** Why this one (for inspectability). */
    reason: string;
}
/**
 * Pick the single most relevant un-touched capability to suggest at a natural
 * pause.
 *
 * @param model   the user-skill model (drives beginner vs advanced copy)
 * @param seen    capabilities the user has already used/touched (excluded)
 * @param opts    tuning: cap how many seen-before suggestions we cycle through
 */
export declare function suggestNextValue(model: UserSkillModel, seen: ObservedCapability[], opts?: {
    maxFallbacks?: number;
}): ValueSuggestion | null;
//# sourceMappingURL=guidance.d.ts.map