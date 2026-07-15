export type SkillTier = 'beginner' | 'intermediate' | 'advanced';
export type ExplainDepth = 'full' | 'condensed' | 'minimal';
/** Explicit, user-issued instruction about explanation depth. */
export type SkillOverride = 'more' | 'less';
/** Named, observable behaviors that move the score. */
export type SkillSignal = 'advanced-flag' | 'scripted-usage' | 'config-override' | 'technical-vocab' | 'plain-language' | 'fast-clean' | 'repeated-errors' | 'dismissed-tutorial';
/** One entry in the inspectability audit trail. */
export interface SkillAuditEntry {
    ts: number;
    signal: SkillSignal | 'override' | 'message';
    delta: number;
    scoreBefore: number;
    scoreAfter: number;
    effectiveScore: number;
    tier: SkillTier;
    reason: string;
}
/** Capabilities we can observe the user touching (for Step 4 surfacing). */
export type ObservedCapability = 'preset' | 'config' | 'mcp' | 'workflow' | 'loop' | 'goal' | 'sessions' | 'export' | 'hooks' | 'ide' | 'vim' | 'teleport' | 'eval' | 'doctor' | 'custom-command' | 'skill' | 'learn';
interface SkillModelOptions {
    /** Default score for a brand-new user (middle ground). */
    initialScore?: number;
    /** Samples before data-driven evidence outweighs the middle default. */
    minSamples?: number;
    /** Hard clamp floor (never assume total novice). */
    floor?: number;
    /** Hard clamp ceiling (never assume total expert). */
    ceiling?: number;
}
/**
 * Real-time, behavior-derived model of a user's coding experience.
 * Stateful across a session; safe to serialize (score/samples/override).
 */
export declare class UserSkillModel {
    private score;
    private readonly floor;
    private readonly ceiling;
    private readonly minSamples;
    private samples;
    private override;
    private readonly audit;
    constructor(opts?: SkillModelOptions);
    /** Observe a named, observable behavior. */
    observeSignal(signal: SkillSignal, reason?: string): void;
    /** Observe command/flag usage patterns. */
    observeCommandUsage(usage: {
        flags?: string[];
        usedPreset?: boolean;
        scripted?: boolean;
        configOverridden?: boolean;
    }): void;
    /** Observe the outcome of a completed task. */
    observeTaskOutcome(o: {
        revisionCycles?: number;
        failures?: number;
        repeatedErrorsSameStep?: number;
        clean?: boolean;
    }): void;
    /** Observe a free-text user message; nudges score via vocabulary. */
    observeMessage(text: string): void;
    /** User said "explain more" (bias toward beginner / full depth). */
    setExplainMore(): void;
    /** User said "skip the explanation" / "less" (bias toward advanced / minimal). */
    setExplainLess(): void;
    /** Clear any explicit override; revert to data-driven scoring. */
    clearOverride(): void;
    /** The data-driven score in [floor, ceiling]. */
    get rawScore(): number;
    /**
     * Score after applying the explicit-override bias. Override shifts the
     * tiering/explanation decision immediately and reversibly without
     * discarding the underlying behavior tracking.
     */
    get effectiveScore(): number;
    /** How confident we are in the data-driven score (0..1). */
    get evidenceConfidence(): number;
    /** Active explicit override, if any. */
    get activeOverride(): SkillOverride | null;
    /** Categorical tier. Ambiguous (low-evidence, no override) → intermediate. */
    tier(): SkillTier;
    /** How much hand-holding to attach to a message. */
    explainDepth(): ExplainDepth;
    /** One-line, human-readable reason for the current tier (for dev logs). */
    tierReason(): string;
    /** Full audit trail. */
    getAuditLog(): readonly SkillAuditEntry[];
    /** Render the audit trail for dev-mode logging. */
    formatAudit(): string;
    /** Reset for a new session (keeps nothing). */
    reset(): void;
    private applyDelta;
    private record;
}
/**
 * Convenience for one-shot subcommands (e.g. `chimera learn`, `chimera
 * workflow`) that don't have a session-scoped model. Builds a throwaway model
 * and feeds the process flags so advanced flags still raise the score; the
 * tier defaults to intermediate when evidence is thin. Cheap and side-effect
 * free — call once per command invocation.
 */
export declare function skillTierFromCli(args?: string[]): SkillTier;
export {};
//# sourceMappingURL=user-skill-model.d.ts.map