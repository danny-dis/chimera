"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BudgetGuard = exports.DEFAULT_TASK_BUDGET = exports.WorkflowObservation = exports.AttemptTrail = void 0;
exports.findDeterministicSkill = findDeterministicSkill;
exports.shouldDelegateToSubagents = shouldDelegateToSubagents;
exports.formatEscalationFailure = formatEscalationFailure;
exports.captureSkill = captureSkill;
exports.detectWorkflowCandidate = detectWorkflowCandidate;
exports.decideDelegation = decideDelegation;
exports.shouldAskOnBlock = shouldAskOnBlock;
const skill_loader_js_1 = require("./skills/skill-loader.js");
const fs_1 = require("fs");
const path = __importStar(require("path"));
class AttemptTrail {
    entries = [];
    push(step, status, detail = '') {
        this.entries.push({ step, status, detail });
    }
    get all() {
        return this.entries;
    }
    toReport(task) {
        if (this.entries.length === 0)
            return `Attempted: (no rungs recorded)`;
        const lines = this.entries.map((e, i) => `${i + 1}. [${e.status}] ${e.step}${e.detail ? ` — ${e.detail}` : ''}`);
        return `Rungs attempted (in order) for: "${task}"\n${lines.join('\n')}`;
    }
}
exports.AttemptTrail = AttemptTrail;
function norm(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
/**
 * Step 3 — check for an exact/near-match skill before reasoning.
 * Uses the existing skill registry (listAllSkills walks .chimera/skills etc.).
 * Normalizes hyphens/spaces so "fix-typo" matches "fix typo".
 */
function findDeterministicSkill(task, workspaceRoot) {
    const skills = (0, skill_loader_js_1.listAllSkills)(workspaceRoot);
    if (skills.length === 0)
        return { skill: null, match: null };
    const tNorm = norm(task);
    const tTokens = new Set(tNorm.split(/\s+/).filter((w) => w.length >= 3));
    let best = null;
    for (const s of skills) {
        const nameNorm = norm(s.name ?? '');
        const descNorm = norm(s.description ?? '');
        const nameTokens = nameNorm.split(/\s+/).filter((w) => w.length >= 3);
        const exact = (nameTokens.length > 0 && nameTokens.every((tok) => tNorm.includes(tok))) ||
            (nameNorm.length >= 4 && tNorm.includes(nameNorm));
        let score = 0;
        for (const tok of nameTokens)
            if (tTokens.has(tok))
                score++;
        for (const tok of descNorm.split(/\s+/).filter((w) => w.length >= 4))
            if (tTokens.has(tok))
                score++;
        if (!best)
            best = { name: s.name, content: s.content, score, exact };
        else if (exact && !best.exact)
            best = { name: s.name, content: s.content, score, exact };
        else if (exact === best.exact && score > best.score)
            best = { name: s.name, content: s.content, score, exact };
    }
    if (!best || (best.score === 0 && !best.exact))
        return { skill: null, match: null };
    const match = best.exact ? 'exact' : best.score >= 1 ? 'near' : null;
    if (!match)
        return { skill: null, match: null };
    return { skill: { name: best.name, content: best.content }, match };
}
/**
 * Step 5 — is this task the right shape for subagent delegation (CoordinatorEngine /
 * hive preset) rather than the single-agent loop? Cheap, dependency-free heuristic.
 */
function shouldDelegateToSubagents(task, complexity) {
    if (complexity.overall >= 0.7)
        return true;
    // ponytail: naive keyword heuristic, upgrade to TaskDecomposer.confidence if false negatives bite.
    return /\b(and then|step[s]?|each of|parallel|subtask|multiple files|refactor across|one per|for every|all of these)\b/i.test(task);
}
/**
 * Step 2 — turn a failure into an ordered, explained trail. Never a bare dead end.
 */
function formatEscalationFailure(task, trail, blocker) {
    const steps = trail.toReport(task);
    return [
        `Could not complete: "${task}".`,
        '',
        steps,
        '',
        `Blocker: ${blocker}`,
        '',
        'Next rung to try: if this is large/decomposable, escalate to subagent delegation',
        '(CoordinatorEngine / hive preset); otherwise supply the missing input, credential,',
        'or spec noted in the blocker above.',
    ].join('\n');
}
/**
 * Step 4 — package a solved approach as a reusable skill. Single-shot primitive
 * (the existing learning-engine / AutoSkillService owns batch dedup + the
 * "reusable vs one-off" decision). Write to
 * `<workspaceRoot>/.chimera/skills/<slug>.md`.
 *
 * ponytail: no merge/dedup here — callers check listAllSkills first to avoid
 * skill sprawl; this only writes.
 */
function captureSkill(opts) {
    const slug = opts.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const dir = path.join(opts.workspaceRoot, '.chimera', 'skills');
    if (!(0, fs_1.existsSync)(dir))
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    const p = path.join(dir, `${slug}.md`);
    const fm = [
        '---',
        `name: ${opts.name}`,
        `description: ${opts.description}`,
        '---',
        '',
        opts.content,
    ].join('\n');
    (0, fs_1.writeFileSync)(p, fm, 'utf-8');
    return p;
}
// ===========================================================================
// STEP 5 — Workflow composition from repeated skill/tool sequences.
// ===========================================================================
/**
 * A rolling observation of the skill/tool sequence invoked for one task.
 * The orchestrator appends a token per rung actually executed; across tasks
 * these sequences are compared to find repeats.
 */
class WorkflowObservation {
    seq = [];
    record(token) {
        this.seq.push(token);
    }
    get sequence() {
        return this.seq;
    }
    key() {
        return this.seq.join(' > ');
    }
}
exports.WorkflowObservation = WorkflowObservation;
/**
 * Given a history of observed sequences, find one that repeats >= minRepeats
 * and is long enough to be worth composing. Returns a suggested
 * WorkflowDefinition (steps = the observed rungs) or null.
 *
 * ponytail: this is the *detector*, not the auto-writer. It flags a candidate;
 * the caller (learning engine) decides whether to persist it. Keeps the
 * heuristic dependency-free and inspectable.
 */
function detectWorkflowCandidate(history, opts = {}) {
    const minRepeats = opts.minRepeats ?? 3;
    const minLength = opts.minLength ?? 3;
    const counts = new Map();
    for (const obs of history) {
        if (obs.sequence.length < minLength)
            continue;
        const k = obs.key();
        if (!counts.has(k))
            counts.set(k, []);
        counts.get(k).push([...obs.sequence]);
    }
    for (const [k, seqs] of counts) {
        if (seqs.length >= minRepeats) {
            const steps = seqs[0].map((tok, i) => ({
                id: `step-${i + 1}-${tok.replace(/[^a-z0-9]+/gi, '-')}`.slice(0, 48),
                kind: 'tool',
                config: { skill: tok },
            }));
            const base = `composed-${seqs[0].join('-').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`.toLowerCase();
            return {
                name: base,
                definition: {
                    name: base,
                    description: `Auto-composed from ${seqs.length} repeated runs of: ${k}`,
                    tags: ['composed', 'auto'],
                    steps,
                },
            };
        }
    }
    return null;
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
function decideDelegation(task, complexity, ctx) {
    const t = task.toLowerCase();
    // Different tool/permission scope → always delegate (safety boundary).
    if (ctx.needsDifferentScope) {
        return {
            delegate: true,
            reason: 'different-scope',
            detail: 'subtask requires a tool/permission scope the main agent should not hold',
            rung: 'subagent-delegation',
        };
    }
    // Long, separate context that would bloat the main context window.
    if (ctx.needsSeparateContext || /deep research|large refactor|exhaustive test|multi-repo|long investigation/i.test(t)) {
        return {
            delegate: true,
            reason: 'separate-context',
            detail: 'subtask needs a separate context window to avoid bloating the main task',
            rung: 'subagent-delegation',
        };
    }
    // Independent + parallelizable subtasks → delegate for fan-out.
    if (ctx.hasSubtasks && ctx.independent) {
        return {
            delegate: true,
            reason: 'independent-parallel',
            detail: 'subtasks are independent and parallelizable → CoordinatorEngine fan-out',
            rung: 'subagent-delegation',
        };
    }
    // High overall complexity + decomposable language → fan-out.
    if (complexity.overall >= 0.7 && /\b(and then|step[s]?|each of|parallel|subtask|multiple files|refactor across|one per|for every|all of these)\b/i.test(t)) {
        return {
            delegate: true,
            reason: 'decomposable-fanout',
            detail: 'high complexity + decomposable phrasing → decompose → spawn → aggregate',
            rung: 'subagent-delegation',
        };
    }
    // Trivial work → do not pay delegation overhead.
    if (complexity.overall < 0.3 && !ctx.hasSubtasks) {
        return {
            delegate: false,
            reason: 'trivial-no-delegate',
            detail: 'low complexity, single step — delegation overhead not justified',
            rung: 'subagent-delegation',
        };
    }
    return {
        delegate: false,
        reason: 'below-threshold',
        detail: 'does not meet any delegation criterion — handle inline',
        rung: 'subagent-delegation',
    };
}
exports.DEFAULT_TASK_BUDGET = {
    maxAttemptsPerRung: 2,
    maxRunways: 6,
    timeBudgetMs: 180_000,
};
/**
 * Track per-rung attempt counts and the overall budget. Returns whether the
 * next attempt is allowed, and the reason if blocked.
 */
class BudgetGuard {
    budget;
    rungAttempts = new Map();
    startedAt = Date.now();
    constructor(budget = exports.DEFAULT_TASK_BUDGET) {
        this.budget = budget;
    }
    /** Record an attempt at a rung; returns false if that rung is over its cap. */
    tryRung(rung) {
        const n = (this.rungAttempts.get(rung) ?? 0) + 1;
        this.rungAttempts.set(rung, n);
        if (n > this.budget.maxAttemptsPerRung) {
            return { ok: false, reason: `rung "${rung}" hit attempt cap (${this.budget.maxAttemptsPerRung})` };
        }
        if (this.totalRunways() > this.budget.maxRunways) {
            return { ok: false, reason: `total rung cap (${this.budget.maxRunways}) exhausted` };
        }
        if (Date.now() - this.startedAt > this.budget.timeBudgetMs) {
            return { ok: false, reason: `time budget (${this.budget.timeBudgetMs}ms) exhausted` };
        }
        return { ok: true };
    }
    totalRunways() {
        let s = 0;
        for (const v of this.rungAttempts.values())
            s += v;
        return s;
    }
    report() {
        const lines = [...this.rungAttempts.entries()].map(([k, v]) => `  - ${k}: ${v} attempt(s)`);
        return [
            `Budget: ${this.totalRunways()}/${this.budget.maxRunways} rungs used,`,
            `time ${Date.now() - this.startedAt}ms/${this.budget.timeBudgetMs}ms.`,
            lines.length ? 'Per-rung:\n' + lines.join('\n') : 'Per-rung: none',
        ].join('\n');
    }
}
exports.BudgetGuard = BudgetGuard;
/**
 * Should the orchestrator ask the user (vs. guess or give up)? Only when the
 * ladder is exhausted AND the blocker is missing *information* — never to
 * paper over ambiguity by guessing, and never before trying the ladder.
 */
function shouldAskOnBlock(blocker, ladderExhausted) {
    if (!ladderExhausted) {
        return { ask: false, reason: 'ladder not exhausted — keep escalating, do not ask yet' };
    }
    const infoSignal = /missing (input|spec|credential|api key|permission|context|requirement|decision)|ambiguous|unclear (what|which|how)|need (to know|clarification)/i.test(blocker);
    if (infoSignal) {
        return { ask: true, reason: 'blocker is missing information, not missing effort — ask after ladder exhausted' };
    }
    return { ask: false, reason: 'blocker is an effort/tool failure, not missing info — do not guess, report trail' };
}
//# sourceMappingURL=escalation-ladder.js.map