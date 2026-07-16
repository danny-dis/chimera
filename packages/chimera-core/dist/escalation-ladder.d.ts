import type { ComplexityScore } from './types/router.js';
import type { WorkflowDefinition } from './workflow/types.js';
/**
 * Escalation ladder for Step 2/3/4 of the persistence+determinism upgrade.
 *
 * The orchestrator's main loop (SessionOrchestrator.execute) already runs an
 * implicit escalation (deliberation engine → inline fallback → reviewer →
 * challenger). This module makes that ladder *explicit and observable*:
 *   - determinism-first: arm an exact/near-match skill before any open-ended
 *     reasoning (Step 3), so known recipes are followed, not re-derived;
 *   - AttemptTrail: records every rung tried, in order, so a failure never
 *     returns a bare "couldn't do it" (Step 2);
 *   - shouldDelegateToSubagents: flags when a task is the right shape for the
 *     CoordinatorEngine/hive rung instead of muddling through (Step 5).
 *
 * ponytail: skills here are markdown *recipes*, not executables — true
 * no-LLM execution needs a skill→script runner, which is out of scope. We arm
 * the recipe (low temp, deterministic directive) rather than invent a runner.
 */
export type TrailStatus = 'armed' | 'skipped' | 'attempt' | 'success' | 'fallback' | 'available' | 'failed';
export interface TrailEntry {
    step: string;
    status: TrailStatus;
    detail: string;
}
export declare class AttemptTrail {
    private entries;
    push(step: string, status: TrailStatus, detail?: string): void;
    get all(): readonly TrailEntry[];
    toReport(task: string): string;
}
export interface DeterministicMatch {
    skill: {
        name: string;
        content: string;
    } | null;
    match: 'exact' | 'near' | null;
}
/**
 * Step 3 — check for an exact/near-match skill before reasoning.
 * Uses the existing skill registry (listAllSkills walks .chimera/skills etc.).
 * Normalizes hyphens/spaces so "fix-typo" matches "fix typo".
 */
export declare function findDeterministicSkill(task: string, workspaceRoot: string): DeterministicMatch;
/**
 * Step 5 — is this task the right shape for subagent delegation (CoordinatorEngine /
 * hive preset) rather than the single-agent loop? Cheap, dependency-free heuristic.
 */
export declare function shouldDelegateToSubagents(task: string, complexity: ComplexityScore): boolean;
/**
 * Step 2 — turn a failure into an ordered, explained trail. Never a bare dead end.
 */
export declare function formatEscalationFailure(task: string, trail: AttemptTrail, blocker: string): string;
/**
 * Step 4 — package a solved approach as a reusable skill. Single-shot primitive
 * (the existing learning-engine / AutoSkillService owns batch dedup + the
 * "reusable vs one-off" decision). Write to
 * `<workspaceRoot>/.chimera/skills/<slug>.md`.
 *
 * ponytail: no merge/dedup here — callers check listAllSkills first to avoid
 * skill sprawl; this only writes.
 */
export declare function captureSkill(opts: {
    name: string;
    description: string;
    content: string;
    workspaceRoot: string;
}): string;
/**
 * A rolling observation of the skill/tool sequence invoked for one task.
 * The orchestrator appends a token per rung actually executed; across tasks
 * these sequences are compared to find repeats.
 */
export declare class WorkflowObservation {
    private seq;
    record(token: string): void;
    get sequence(): readonly string[];
    key(): string;
}
/**
 * Given a history of observed sequences, find one that repeats >= minRepeats
 * and is long enough to be worth composing. Returns a suggested
 * WorkflowDefinition (steps = the observed rungs) or null.
 *
 * ponytail: this is the *detector*, not the auto-writer. It flags a candidate;
 * the caller (learning engine) decides whether to persist it. Keeps the
 * heuristic dependency-free and inspectable.
 */
export declare function detectWorkflowCandidate(history: WorkflowObservation[], opts?: {
    minRepeats?: number;
    minLength?: number;
}): {
    name: string;
    definition: WorkflowDefinition;
} | null;
export type DelegationReason = 'decomposable-fanout' | 'independent-parallel' | 'separate-context' | 'different-scope' | 'trivial-no-delegate' | 'below-threshold';
export interface DelegationDecision {
    delegate: boolean;
    reason: DelegationReason;
    /** Human-readable line recorded on the attempt trail / event stream. */
    detail: string;
    /** Which rung this maps to in the escalation ladder. */
    rung: 'subagent-delegation';
}
/**
 * Decide whether a subtask should be handed to the CoordinatorEngine (hive)
 * or handled inline. Encodes the spec's criteria:
 *   - DELEGATE when the subtask needs a long, separate context (deep research,
 *     large refactor, exhaustive test generation) that would bloat the main
 *     task's context.
 *   - DELEGATE when subtasks are independent and parallelizable.
 *   - DELEGATE when the subtask needs a different tool/permission scope than
 *     the main agent should hold.
 *   - DO NOT delegate trivial steps just to avoid doing them — delegation has
 *     overhead and must earn its cost.
 *   - Subagents report a structured AggregatedResult (see coordinator/types).
 */
export declare function decideDelegation(task: string, complexity: ComplexityScore, ctx: {
    hasSubtasks?: boolean;
    independent?: boolean;
    needsSeparateContext?: boolean;
    needsDifferentScope?: boolean;
}): DelegationDecision;
export interface TaskBudget {
    /** Max attempts per single approach/rung before moving on. */
    maxAttemptsPerRung: number;
    /** Hard cap on total rungs tried for one task. */
    maxRunways: number;
    /** Wall-clock budget for the whole task, ms. */
    timeBudgetMs: number;
}
export declare const DEFAULT_TASK_BUDGET: TaskBudget;
/**
 * Track per-rung attempt counts and the overall budget. Returns whether the
 * next attempt is allowed, and the reason if blocked.
 */
export declare class BudgetGuard {
    private budget;
    private rungAttempts;
    private startedAt;
    constructor(budget?: TaskBudget);
    /** Record an attempt at a rung; returns false if that rung is over its cap. */
    tryRung(rung: string): {
        ok: boolean;
        reason?: string;
    };
    totalRunways(): number;
    report(): string;
}
/**
 * Should the orchestrator ask the user (vs. guess or give up)? Only when the
 * ladder is exhausted AND the blocker is missing *information* — never to
 * paper over ambiguity by guessing, and never before trying the ladder.
 */
export declare function shouldAskOnBlock(blocker: string, ladderExhausted: boolean): {
    ask: boolean;
    reason: string;
};
//# sourceMappingURL=escalation-ladder.d.ts.map