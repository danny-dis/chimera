"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWorkflow = runWorkflow;
exports.runLoopStep = runLoopStep;
exports.detectCompletionSignal = detectCompletionSignal;
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Execute a workflow definition. Returns a `WorkflowRunResult` describing
 * the run. Never throws on a failed step — failures are surfaced via
 * `result.status === 'error'` and `result.error`.
 *
 * Concurrency: each top-level step is run sequentially in the order it
 * appears in `definition.steps`. Steps that internally fan out (e.g.
 * `parallel`) run their children concurrently and wait for all of them.
 */
async function runWorkflow(definition, options) {
    const start = Date.now();
    const runId = options.runId ?? `run-${start}-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = {
        runId,
        state: { ...(options.initialState ?? {}) },
        inputs: { ...(options.inputs ?? {}) },
        startedAtMs: start,
    };
    const eventStream = options.handlers.eventStream;
    if (eventStream) {
        eventStream.append({
            type: 'workflow_run_started',
            name: definition.name,
            runId,
        });
    }
    const outputs = {};
    let firstError;
    for (const step of definition.steps) {
        const stepStart = Date.now();
        let stepError;
        try {
            const value = await runStep(step, ctx, options.handlers, outputs);
            outputs[step.id] = value;
            // Persist the latest value of each step into the shared state so
            // later steps (and the gate evaluator) can read it.
            ctx.state[step.id] = value;
            if (eventStream) {
                eventStream.append({
                    type: 'workflow_step_completed',
                    name: definition.name,
                    runId,
                    stepId: step.id,
                    kind: step.kind,
                    durationMs: Date.now() - stepStart,
                });
            }
        }
        catch (err) {
            stepError = err instanceof Error ? err.message : String(err);
            // Required steps abort the run; optional steps are logged but
            // execution continues. Matches the `required` flag in WorkflowStep.
            if (step.required !== false) {
                firstError = stepError;
                break;
            }
            if (eventStream) {
                eventStream.append({
                    type: 'workflow_step_completed',
                    name: definition.name,
                    runId,
                    stepId: step.id,
                    kind: step.kind,
                    durationMs: Date.now() - stepStart,
                });
            }
        }
    }
    const status = firstError ? 'error' : 'success';
    const result = {
        runId,
        workflowName: definition.name,
        status,
        durationMs: Date.now() - start,
        stepCount: definition.steps.length,
        outputs,
        error: firstError,
    };
    if (eventStream) {
        eventStream.append({
            type: 'workflow_run_completed',
            name: definition.name,
            runId,
            status,
            durationMs: result.durationMs,
            stepCount: result.stepCount,
        });
    }
    return result;
}
// ---------------------------------------------------------------------------
// Step dispatch
// ---------------------------------------------------------------------------
async function runStep(step, ctx, handlers, outputs) {
    switch (step.kind) {
        case 'llm':
            return runLlmStep(step, ctx, handlers);
        case 'tool':
            return runToolStep(step, ctx, handlers);
        case 'parallel':
            return runParallelStep(step, ctx, handlers, outputs);
        case 'sequence':
            return runSequenceStep(step, ctx, handlers, outputs);
        case 'gate':
            return runGateStep(step, ctx, handlers);
        case 'loop':
            return runLoopStep(step, ctx, handlers, outputs);
        default: {
            // Exhaustiveness — the union is closed at the type level, so a
            // misnamed kind would be a runtime bug.
            const exhaustive = step.kind;
            throw new Error(`WorkflowRunner: unknown step kind '${String(exhaustive)}'`);
        }
    }
}
// ---------------------------------------------------------------------------
// llm
// ---------------------------------------------------------------------------
async function runLlmStep(step, _ctx, handlers) {
    const role = step.config.role ?? 'default';
    const provider = handlers.providers[role];
    if (!provider) {
        throw new Error(`WorkflowRunner: llm step '${step.id}' requested role '${role}' but no provider is registered for it`);
    }
    const messages = step.config.messages ?? [
        { role: 'user', content: step.config.prompt ?? '' },
    ];
    const options = {
        temperature: step.config.temperature ?? 0.7,
        maxTokens: step.config.maxTokens ?? 4096,
        responseFormat: step.config.responseFormat ?? 'text',
    };
    const caller = handlers.llmCaller ?? ((p) => defaultLlmCaller(p, handlers));
    const result = await caller({ role, messages, options, ctx: _ctx });
    // Best-effort JSON parse: structured-output roles (writer, reviewer,
    // challenger) emit JSON; gates look up `.verdict` on the parsed object.
    // Failures are non-fatal — the raw content is still in `.content`.
    let parsed;
    try {
        const trimmed = result.content.trim();
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
            parsed = JSON.parse(trimmed.slice(start, end + 1));
        }
    }
    catch {
        // Not JSON — return raw content only.
    }
    return { content: result.content, parsed, usage: result.usage };
}
async function defaultLlmCaller(params, handlers) {
    const provider = handlers.providers[params.role];
    if (!provider) {
        throw new Error(`WorkflowRunner.defaultLlmCaller: no provider registered for role '${params.role}'`);
    }
    return provider.complete(params.messages, params.options);
}
// ---------------------------------------------------------------------------
// tool
// ---------------------------------------------------------------------------
async function runToolStep(step, _ctx, handlers) {
    const toolName = step.config.name ?? '';
    if (!toolName) {
        throw new Error(`WorkflowRunner: tool step '${step.id}' missing config.name`);
    }
    if (!handlers.toolExecutor) {
        throw new Error(`WorkflowRunner: tool step '${step.id}' requires a toolExecutor in handlers`);
    }
    const args = step.config.args ?? {};
    const result = await handlers.toolExecutor(toolName, args);
    if (!result.success) {
        throw new Error(`WorkflowRunner: tool '${toolName}' failed: ${result.error ?? 'unknown'}`);
    }
    return result.data ?? null;
}
async function runParallelStep(step, ctx, handlers, outputs) {
    const branches = step.config.branches ?? [];
    if (branches.length === 0) {
        return { branches: {}, results: [] };
    }
    // Optional `reviewerFirst` config: a single branch is awaited first; if
    // its result equals `config.passOn`, the `dependentBranchIds` are not
    // invoked at all (saves the cost of calling the challenger when the
    // reviewer already passed).
    const reviewerFirst = step.config.reviewerFirst;
    if (reviewerFirst) {
        const reviewerBranch = branches.find((b) => b.id === reviewerFirst.branchId);
        if (!reviewerBranch) {
            throw new Error(`WorkflowRunner: parallel step '${step.id}' reviewerFirst.branchId='${reviewerFirst.branchId}' not found in branches`);
        }
        const reviewerValue = await runStep(reviewerBranch, ctx, handlers, outputs);
        const reviewerVerdict = extractVerdict(reviewerValue);
        if (reviewerVerdict === reviewerFirst.passOn) {
            // Reviewer passed — skip dependents entirely. Their result is
            // surfaced as 'rejected' with a marker so callers can see why.
            const skipped = reviewerFirst.dependentBranchIds.map((id) => ({
                branchId: id,
                status: 'rejected',
                error: 'skipped: reviewer passed',
            }));
            const branchResults = {
                [reviewerBranch.id]: reviewerValue,
                ...Object.fromEntries(skipped.map((s) => [s.branchId, undefined])),
            };
            return { branches: branchResults, results: skipped };
        }
        // Reviewer did not pass — run dependents in parallel.
        const dependents = branches.filter((b) => reviewerFirst.dependentBranchIds.includes(b.id));
        const dependentSettled = await Promise.allSettled(dependents.map((b) => runStep(b, ctx, handlers, outputs)));
        const dependentResults = dependentSettled.map((s, i) => s.status === 'fulfilled'
            ? { branchId: dependents[i].id, status: 'fulfilled', value: s.value }
            : { branchId: dependents[i].id, status: 'rejected', error: errorMessage(s.reason) });
        return {
            branches: {
                [reviewerBranch.id]: reviewerValue,
                ...Object.fromEntries(dependentResults.map((r) => [r.branchId, r.value])),
            },
            results: dependentResults,
        };
    }
    // Default path: fan-out across all branches concurrently.
    const settled = await Promise.allSettled(branches.map((b) => runStep(b, ctx, handlers, outputs)));
    const results = settled.map((s, i) => s.status === 'fulfilled'
        ? { branchId: branches[i].id, status: 'fulfilled', value: s.value }
        : { branchId: branches[i].id, status: 'rejected', error: errorMessage(s.reason) });
    return {
        branches: Object.fromEntries(results.map((r) => [r.branchId, r.value])),
        results,
    };
}
function extractVerdict(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    const obj = value;
    // Check the top-level object first (when the LLM step's content is
    // already parsed JSON — the parsed object IS the value).
    const top = obj.verdict;
    if (typeof top === 'string')
        return top;
    // Fall back to a `parsed.verdict` (when the LLM step returned
    // `{ content, parsed, usage }` and the verdict is in the parsed object).
    const nested = obj.parsed;
    const inner = nested?.verdict;
    if (typeof inner === 'string')
        return inner;
    return undefined;
}
// ---------------------------------------------------------------------------
// sequence
// ---------------------------------------------------------------------------
async function runSequenceStep(step, ctx, handlers, outputs) {
    const subSteps = step.config.steps ?? [];
    const out = [];
    for (const sub of subSteps) {
        const v = await runStep(sub, ctx, handlers, outputs);
        out.push(v);
    }
    return out;
}
// ---------------------------------------------------------------------------
// gate
// ---------------------------------------------------------------------------
async function runGateStep(step, ctx, handlers) {
    if (!handlers.gateEvaluator) {
        return { status: 'success' };
    }
    const result = await handlers.gateEvaluator(step, ctx.state);
    if (result === 'error') {
        const reason = step.config.reason ?? `gate '${step.id}' rejected`;
        // Throwing is what causes the wrapping `runWorkflow` loop to mark the
        // run as 'error' and break out — the gate step's return value is only
        // observed by other steps via `outputs[id]` when the gate passes.
        throw new Error(reason);
    }
    return { status: 'success' };
}
// ---------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------
/**
 * Detect whether a completion signal string appears in the AI output.
 *
 * Two detection strategies (ported from archon's `detectCompletionSignal`):
 * 1. XML-wrapped: `<tag>SIGNAL</tag>` with matching open/close tag names,
 *    case-insensitive, whitespace-tolerant.
 * 2. Plain signal anywhere in the output (case-insensitive, trimmed).
 */
function detectCompletionSignal(output, signal) {
    if (!signal)
        return false;
    const s = signal.trim().toLowerCase();
    if (!s)
        return false;
    // Strategy 1: XML-wrapped — <tag>signal</tag> with matching tag names
    const xmlPattern = new RegExp(`<([a-zA-Z][a-zA-Z0-9]*)\\s*>\\s*${escapeRegExp(s)}\\s*</\\1\\s*>`, 'i');
    if (xmlPattern.test(output))
        return true;
    // Strategy 2: plain signal anywhere in output (case-insensitive)
    return output.toLowerCase().includes(s);
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
async function runLoopStep(step, ctx, handlers, _outputs) {
    const config = step.config;
    const prompt = config.prompt ?? '';
    const until = config.until ?? '';
    const maxIterations = config.max_iterations ?? 10;
    const freshContext = config.fresh_context ?? false;
    const untilBash = config.until_bash;
    if (!prompt) {
        throw new Error(`WorkflowRunner: loop step '${step.id}' missing config.prompt`);
    }
    if (!until) {
        throw new Error(`WorkflowRunner: loop step '${step.id}' missing config.until`);
    }
    if (maxIterations < 1) {
        throw new Error(`WorkflowRunner: loop step '${step.id}' max_iterations must be >= 1`);
    }
    const role = config.role ?? 'default';
    const provider = handlers.providers[role];
    if (!provider) {
        throw new Error(`WorkflowRunner: loop step '${step.id}' requested role '${role}' but no provider is registered for it`);
    }
    const caller = handlers.llmCaller ?? ((p) => defaultLlmCaller(p, handlers));
    const eventStream = handlers.eventStream;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastOutput = '';
    const history = [];
    for (let i = 1; i <= maxIterations; i++) {
        // Emit iteration started
        if (eventStream) {
            eventStream.append({
                type: 'loop_iteration_started',
                runId: ctx.runId,
                stepId: step.id,
                iteration: i,
                maxIterations,
            });
        }
        const iterationStart = Date.now();
        // Build messages: fresh context resets history each iteration
        const messages = freshContext
            ? [{ role: 'user', content: prompt }]
            : [...history, { role: 'user', content: prompt }];
        let content;
        let usage;
        try {
            const result = await caller({
                role,
                messages,
                options: { temperature: 0.7, maxTokens: 4096 },
                ctx,
            });
            content = result.content;
            usage = result.usage;
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            if (eventStream) {
                eventStream.append({
                    type: 'loop_iteration_failed',
                    runId: ctx.runId,
                    stepId: step.id,
                    iteration: i,
                    error,
                });
            }
            throw new Error(`WorkflowRunner: loop step '${step.id}' iteration ${i} failed: ${error}`);
        }
        totalInputTokens += usage.inputTokens;
        totalOutputTokens += usage.outputTokens;
        lastOutput = content;
        // Accumulate history (unless fresh context)
        if (!freshContext) {
            history.push({ role: 'assistant', content });
        }
        // Check completion signal
        const signalDetected = detectCompletionSignal(content, until);
        // Check until_bash if configured
        let bashComplete = false;
        if (untilBash && handlers.toolExecutor) {
            try {
                const bashResult = await handlers.toolExecutor('bash', {
                    command: untilBash,
                    env: { LOOP_PREV_OUTPUT: lastOutput },
                });
                bashComplete = bashResult.success;
            }
            catch {
                bashComplete = false;
            }
        }
        const completionDetected = signalDetected || bashComplete;
        const durationMs = Date.now() - iterationStart;
        // Emit iteration completed
        if (eventStream) {
            eventStream.append({
                type: 'loop_iteration_completed',
                runId: ctx.runId,
                stepId: step.id,
                iteration: i,
                durationMs,
                completionDetected,
            });
        }
        if (completionDetected) {
            return {
                content: lastOutput,
                iterations: i,
                completionDetected: true,
                usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
            };
        }
    }
    // Max iterations exceeded
    throw new Error(`WorkflowRunner: loop step '${step.id}' exceeded max iterations (${maxIterations}) without completion signal '${until}'`);
}
// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function errorMessage(reason) {
    return reason instanceof Error ? reason.message : String(reason);
}
//# sourceMappingURL=runner.js.map