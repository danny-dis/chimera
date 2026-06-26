"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_WORKFLOW_FOR_MODE = exports.BUILT_IN_WORKFLOWS = void 0;
exports.registerBuiltInWorkflows = registerBuiltInWorkflows;
exports.defaultWorkflowFor = defaultWorkflowFor;
// ---------------------------------------------------------------------------
// Pure-data definitions for the new built-ins. The existing
// `standard-draft` and `quality-gate` workflows are owned by the
// orchestrator / AgentMesh respectively; their data is registered below.
// ---------------------------------------------------------------------------
const SIMPLE_ASK_STEPS = [
    { id: 'writer', kind: 'llm', config: { role: 'writer', noToolLoop: true } },
];
const SIMPLE_PLAN_STEPS = [
    { id: 'planner', kind: 'llm', config: { role: 'planner', noToolLoop: true } },
    { id: 'gate', kind: 'gate', config: { passOn: 'PASS' } },
];
/**
 * The full set of built-in workflows, in registration order. The order
 * matters for `chimera workflow list` (registration order is preserved)
 * and for the documented "first matching default wins" rule below.
 */
exports.BUILT_IN_WORKFLOWS = Object.freeze([
    Object.freeze({
        name: 'simple-ask',
        description: 'Single LLM call, no review, no tool loop. Cheapest path — use for `ask` mode.',
        tags: ['builtin', 'cheap', 'ask'],
        steps: SIMPLE_ASK_STEPS,
    }),
    Object.freeze({
        name: 'simple-plan',
        description: 'Single planner LLM call, no execution. Use for `plan` mode.',
        tags: ['builtin', 'plan', 'no-execute'],
        steps: SIMPLE_PLAN_STEPS,
    }),
    Object.freeze({
        name: 'standard-draft',
        description: 'Writer (with tool loop) → reviewer ∥ challenger → synthesize. Default for `code` and `debug`.',
        tags: ['builtin', 'default', 'code', 'debug'],
        steps: [
            { id: 'writer', kind: 'llm', config: { role: 'writer', toolLoop: true } },
            {
                id: 'quality-gate',
                kind: 'parallel',
                config: {
                    branches: [
                        { id: 'reviewer', kind: 'llm', config: { role: 'reviewer' } },
                        { id: 'challenger', kind: 'llm', config: { role: 'challenger' } },
                    ],
                },
            },
            { id: 'synthesize', kind: 'tool', config: { tool: 'response-synthesizer' } },
        ],
    }),
    Object.freeze({
        name: 'quality-gate',
        description: 'Reviewer (LLM) → optional challenger (LLM) → verdict gate. Use to validate an existing draft.',
        tags: ['builtin', 'review'],
        steps: [
            { id: 'reviewer', kind: 'llm', config: { role: 'reviewer' } },
            { id: 'challenge', kind: 'parallel', config: { branches: [] } },
            { id: 'verdict', kind: 'gate', config: { passOn: 'PASS' } },
        ],
    }),
    Object.freeze({
        name: 'parallel-decompose',
        description: 'Decompose task → fan-out sub-agents (dependency-aware) → aggregate. Heavy fan-out.',
        tags: ['builtin', 'coordinator', 'fan-out'],
        steps: [
            { id: 'decompose', kind: 'llm', config: { role: 'decomposer' } },
            { id: 'spawn', kind: 'parallel', config: { branches: [] } },
            { id: 'aggregate', kind: 'llm', config: { role: 'aggregator' } },
        ],
    }),
]);
/**
 * Default workflow per mode. The orchestrator consults this map to pick
 * the right workflow when the user does not specify one explicitly.
 *
 * The map is intentionally a `Partial<Record<Mode, ...>>` — modes that
 * should fall through to the orchestrator's hardcoded default are
 * omitted. The orchestrator's fallback (currently `standard-draft`) is
 * what runs for unmapped modes.
 */
exports.DEFAULT_WORKFLOW_FOR_MODE = Object.freeze({
    ask: 'simple-ask',
    plan: 'simple-plan',
    code: 'standard-draft',
    debug: 'standard-draft',
    review: 'quality-gate',
    auto: 'standard-draft',
    // `oal` is internal automation — falls through to the orchestrator default.
});
/**
 * Register every built-in workflow in `BUILT_IN_WORKFLOWS` plus the
 * legacy static registrations (CoordinatorEngine, AgentMesh) into the
 * given registry.
 *
 * Idempotent: calling twice with the same registry is a no-op for
 * `register()` (last-writer-wins) and the data here is pure, so the
 * observable result is identical.
 *
 * Emits one `workflow_registered` event per workflow on the given
 * event stream. Missing event stream is allowed; registration still
 * proceeds.
 */
function registerBuiltInWorkflows(registry, eventStream) {
    // New pure-data built-ins.
    for (const wf of exports.BUILT_IN_WORKFLOWS) {
        registry.register(wf);
        emitRegistered(eventStream, wf.name, wf.steps.length, undefined);
    }
}
function emitRegistered(eventStream, name, stepCount, path) {
    if (!eventStream)
        return;
    try {
        eventStream.append({ type: 'workflow_registered', name, stepCount, path });
    }
    catch {
        // Best-effort telemetry; never crash startup on event-stream issues.
    }
}
/**
 * Look up the default workflow name for a mode, falling back to
 * `'standard-draft'` if the mode is unmapped. Returns `null` if the
 * caller explicitly wants the orchestrator's hardcoded behavior.
 */
function defaultWorkflowFor(mode) {
    return exports.DEFAULT_WORKFLOW_FOR_MODE[mode] ?? 'standard-draft';
}
//# sourceMappingURL=index.js.map