"use strict";
// @chimera/learning — Real-time user-skill inference.
//
// Inferring a user's experience level from OBSERVABLE BEHAVIOR, not a quiz.
// The model keeps a continuous confidence score in [0.05, 0.95] (0 = novice,
// 1 = expert). Guidance tiers are derived downstream from that score so the
// experience can shift mid-session as signals change. We never hard-pin to
// 0 or 1 and we default new/ambiguous users to the middle (intermediate).
//
// Signals consumed (see observe* methods):
//   1. Command/flag usage — advanced flags, config overrides, scripting.
//   2. Task outcome — fast/clean execution vs. repeated errors on one step.
//   3. Vocabulary — technical terms used correctly vs. plain-language asks.
//   4. Explicit override — "explain more" / "skip the explanation" (strongest).
//   5. Read/skip telemetry — modeled via the explicit override channel only
//      (we do not track raw scrolling; if richer telemetry is added later,
//      feed it through observeMessage / observeSignal).
//
// Every mutation is recorded in an audit log so adaptive choices stay
// inspectable (dev-mode logging / debugging the tier chosen for a user).
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserSkillModel = void 0;
exports.skillTierFromCli = skillTierFromCli;
// Per-signal score deltas. Positive = more expert, negative = more novice.
// Magnitudes are intentionally small so the score drifts, not jumps.
const SIGNAL_DELTA = {
    'advanced-flag': +0.12,
    'scripted-usage': +0.10,
    'config-override': +0.08,
    'technical-vocab': +0.06,
    'plain-language': -0.06,
    'fast-clean': +0.05,
    'repeated-errors': -0.09,
    'dismissed-tutorial': +0.07,
};
// Lightweight technical-vocabulary markers (no network, no model call).
// Used only to nudge the score; never treated as authoritative.
const TECHNICAL_TERMS = [
    /\b(api|rest|graphql|grpc|endpoint|middleware|handler|controller)\b/i,
    /\b(zod|schema|yup|joi|typescript|tsx|jsx)\b/i,
    /\b(di|ioc|ioc container|dependency injection)\b/i,
    /\b(pr|merge|rebase|bisect|cherry-pick|reflog)\b/i,
    /\b(monorepo|workspace|lerna|turbo|nx|pnpm)\b/i,
    /\b(lru|lock-free|race condition|deadlock|async|await|promise)\b/i,
    /\b(llm|embedding|vector|token|prompt|fine-tun\w*|rag)\b/i,
    /\b(sandbox|capability|tool schema|openapi|swagger)\b/i,
];
const PLAIN_LANGUAGE_MARKERS = [
    /\b(how do i|how to|what is|what's|explain|i don'?t understand|help me|i'?m new|new to|where do i|can you|for dummies|beginner)\b/i,
    /\?\s*$/, // trailing question mark
];
/**
 * Real-time, behavior-derived model of a user's coding experience.
 * Stateful across a session; safe to serialize (score/samples/override).
 */
class UserSkillModel {
    score;
    floor;
    ceiling;
    minSamples;
    samples = 0;
    override = null;
    audit = [];
    constructor(opts = {}) {
        this.score = clamp(opts.initialScore ?? 0.5, opts.floor ?? 0.05, opts.ceiling ?? 0.95);
        this.floor = opts.floor ?? 0.05;
        this.ceiling = opts.ceiling ?? 0.95;
        this.minSamples = opts.minSamples ?? 6;
    }
    // ── Observation API ────────────────────────────────────────────────────
    /** Observe a named, observable behavior. */
    observeSignal(signal, reason) {
        const delta = SIGNAL_DELTA[signal];
        this.applyDelta(signal, delta, reason ?? signal);
    }
    /** Observe command/flag usage patterns. */
    observeCommandUsage(usage) {
        const advancedFlags = (usage.flags ?? []).filter((f) => /^(--preset|--no-learn|--verbose|--repl|--real|--force|-y)$/.test(f));
        if (advancedFlags.length > 0) {
            this.observeSignal('advanced-flag', `advanced flags: ${advancedFlags.join(', ')}`);
        }
        if (usage.usedPreset)
            this.observeSignal('config-override', 'used deliberation preset');
        if (usage.scripted)
            this.observeSignal('scripted-usage', 'scripted/non-interactive usage');
        if (usage.configOverridden)
            this.observeSignal('config-override', 'overrode config');
    }
    /** Observe the outcome of a completed task. */
    observeTaskOutcome(o) {
        if (o.clean) {
            this.observeSignal('fast-clean', 'task completed cleanly');
            return;
        }
        const repeated = o.repeatedErrorsSameStep ?? 0;
        if (repeated > 0) {
            this.observeSignal('repeated-errors', `${repeated} repeated error(s) on same step`);
        }
        else if ((o.revisionCycles ?? 0) + (o.failures ?? 0) > 0) {
            this.observeSignal('repeated-errors', 'task needed revision/failed');
        }
    }
    /** Observe a free-text user message; nudges score via vocabulary. */
    observeMessage(text) {
        const technical = TECHNICAL_TERMS.filter((re) => re.test(text)).length;
        const plain = PLAIN_LANGUAGE_MARKERS.filter((re) => re.test(text)).length;
        if (technical > plain) {
            this.applyDelta('message', Math.min(technical, 3) * 0.03, 'technical vocabulary');
        }
        else if (plain > technical) {
            this.applyDelta('message', -Math.min(plain, 3) * 0.03, 'plain-language question');
        }
    }
    // ── Explicit override (the strongest, reversible signal) ───────────────
    /** User said "explain more" (bias toward beginner / full depth). */
    setExplainMore() {
        this.override = 'more';
        this.record('override', 0, `explicit override: explain MORE (full depth)`);
    }
    /** User said "skip the explanation" / "less" (bias toward advanced / minimal). */
    setExplainLess() {
        this.override = 'less';
        this.record('override', 0, `explicit override: explain LESS (minimal depth)`);
    }
    /** Clear any explicit override; revert to data-driven scoring. */
    clearOverride() {
        if (this.override) {
            this.override = null;
            this.record('override', 0, 'explicit override cleared');
        }
    }
    // ── Derived state ──────────────────────────────────────────────────────
    /** The data-driven score in [floor, ceiling]. */
    get rawScore() {
        return this.score;
    }
    /**
     * Score after applying the explicit-override bias. Override shifts the
     * tiering/explanation decision immediately and reversibly without
     * discarding the underlying behavior tracking.
     */
    get effectiveScore() {
        const bias = this.override === 'more' ? -0.45 : this.override === 'less' ? +0.45 : 0;
        return clamp(this.score + bias, 0, 1);
    }
    /** How confident we are in the data-driven score (0..1). */
    get evidenceConfidence() {
        return Math.min(1, this.samples / this.minSamples);
    }
    /** Active explicit override, if any. */
    get activeOverride() {
        return this.override;
    }
    /** Categorical tier. Ambiguous (low-evidence, no override) → intermediate. */
    tier() {
        if (this.override)
            return this.override === 'more' ? 'beginner' : 'advanced';
        if (this.evidenceConfidence < 1) {
            // Not enough signal yet — never assume novice or expert.
            return 'intermediate';
        }
        const s = this.score;
        if (s < 0.35)
            return 'beginner';
        if (s > 0.7)
            return 'advanced';
        return 'intermediate';
    }
    /** How much hand-holding to attach to a message. */
    explainDepth() {
        if (this.override === 'more')
            return 'full';
        if (this.override === 'less')
            return 'minimal';
        switch (this.tier()) {
            case 'beginner':
                return 'full';
            case 'advanced':
                return 'minimal';
            default:
                return 'condensed';
        }
    }
    /** One-line, human-readable reason for the current tier (for dev logs). */
    tierReason() {
        if (this.override)
            return `explicit override="${this.override}"`;
        if (this.evidenceConfidence < 1) {
            return `low evidence (${this.samples}/${this.minSamples} samples) → default intermediate`;
        }
        return `score=${this.score.toFixed(2)} (${this.tier()})`;
    }
    // ── Inspectability ─────────────────────────────────────────────────────
    /** Full audit trail. */
    getAuditLog() {
        return this.audit;
    }
    /** Render the audit trail for dev-mode logging. */
    formatAudit() {
        return this.audit
            .slice(-20)
            .map((e) => `[${new Date(e.ts).toISOString()}] ${e.signal} Δ${e.delta >= 0 ? '+' : ''}${e.delta.toFixed(2)} → ${e.scoreAfter.toFixed(2)} (${e.tier}) — ${e.reason}`)
            .join('\n');
    }
    /** Reset for a new session (keeps nothing). */
    reset() {
        this.score = 0.5;
        this.samples = 0;
        this.override = null;
        this.audit.length = 0;
    }
    // ── Internal ───────────────────────────────────────────────────────────
    applyDelta(signal, delta, reason) {
        const before = this.score;
        this.score = clamp(this.score + delta, this.floor, this.ceiling);
        this.samples += 1;
        this.record(signal, delta, reason, before);
    }
    record(signal, delta, reason, scoreBefore = this.score) {
        const scoreAfter = signal === 'override' ? this.score : this.score;
        this.audit.push({
            ts: Date.now(),
            signal,
            delta: signal === 'override' ? 0 : delta,
            scoreBefore,
            scoreAfter,
            effectiveScore: this.effectiveScore,
            tier: this.tier(),
            reason,
        });
        // Keep the trail bounded.
        if (this.audit.length > 500)
            this.audit.shift();
    }
}
exports.UserSkillModel = UserSkillModel;
function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}
/**
 * Convenience for one-shot subcommands (e.g. `chimera learn`, `chimera
 * workflow`) that don't have a session-scoped model. Builds a throwaway model
 * and feeds the process flags so advanced flags still raise the score; the
 * tier defaults to intermediate when evidence is thin. Cheap and side-effect
 * free — call once per command invocation.
 */
function skillTierFromCli(args = process.argv.slice(2)) {
    const m = new UserSkillModel();
    m.observeCommandUsage({ flags: args });
    return m.tier();
}
//# sourceMappingURL=user-skill-model.js.map