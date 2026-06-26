"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowDispatcher = void 0;
/**
 * WorkflowDispatcher — background execution engine for declarative workflows.
 *
 * Wraps the existing `runWorkflow()` interpreter with `BackgroundTaskManager`
 * so that workflow runs execute on a worker pool instead of blocking the main
 * agent. The caller gets back a `workflowRunId` immediately and can poll for
 * status via `getStatus()` / `getResult()`.
 *
 * Design invariants:
 *   - The dispatcher is the ONLY component that calls `runWorkflow()` in a
 *     background context. All other callers (CLI `chimera workflow run`) use
 *     the synchronous path directly.
 *   - `WorkflowRunStatus` is the single source of truth for run lifecycle.
 *   - Events are emitted on the provided `EventStream` for TUI/daemon
 *     integration. The dispatcher never writes to the TUI directly.
 */
const background_task_manager_js_1 = require("../agent/background-task-manager.js");
const runner_js_1 = require("./runner.js");
class WorkflowDispatcher {
    taskManager;
    runs = new Map();
    pausedRuns = new Map();
    eventStream;
    maxRetainedRuns;
    constructor(options) {
        this.taskManager = new background_task_manager_js_1.BackgroundTaskManager(options?.maxConcurrency ?? 4);
        this.eventStream = options?.eventStream;
        this.maxRetainedRuns = options?.maxRetainedRuns ?? 100;
        // Wire task-manager lifecycle events → update run status.
        this.taskManager.on('task_started', (task) => {
            const run = this.runs.get(task.id);
            if (run) {
                run.status = 'running';
                run.startedAt = Date.now();
            }
        });
        this.taskManager.on('task_completed', (task) => {
            const run = this.runs.get(task.id);
            if (run) {
                const result = task.result;
                // Handle paused status — loop needs user input
                if (result && result.status === 'paused' && result.pauseContext) {
                    run.status = 'paused';
                    run.result = result;
                    return; // Don't evict — paused runs stay in memory for resume
                }
                // runWorkflow returns error results rather than throwing — detect
                // status 'error' or 'cancelled' and route to the failure path.
                if (result && (result.status === 'error' || result.status === 'cancelled')) {
                    run.status = result.status;
                    run.completedAt = Date.now();
                    run.durationMs = run.completedAt - (run.startedAt ?? run.dispatchedAt);
                    run.error = result.error ?? `workflow ${result.status}`;
                    run.result = result;
                    this.eventStream?.append({
                        type: 'workflow_dispatch_failed',
                        workflowRunId: run.workflowRunId,
                        workflowName: run.workflowName,
                        error: run.error,
                    });
                }
                else {
                    run.status = 'success';
                    run.completedAt = Date.now();
                    run.durationMs = run.completedAt - (run.startedAt ?? run.dispatchedAt);
                    run.result = result;
                    run.stepsCompleted = run.totalSteps;
                    this.eventStream?.append({
                        type: 'workflow_run_completed',
                        name: run.workflowName,
                        runId: run.workflowRunId,
                        status: 'success',
                        durationMs: run.durationMs,
                        stepCount: run.totalSteps ?? 0,
                    });
                }
                this.evictIfNeeded();
            }
        });
        this.taskManager.on('task_failed', (task) => {
            const run = this.runs.get(task.id);
            if (run) {
                run.status = 'error';
                run.completedAt = Date.now();
                run.durationMs = run.completedAt - (run.startedAt ?? run.dispatchedAt);
                run.error = task.error ?? 'unknown error';
                this.eventStream?.append({
                    type: 'workflow_dispatch_failed',
                    workflowRunId: run.workflowRunId,
                    workflowName: run.workflowName,
                    error: run.error,
                });
                this.evictIfNeeded();
            }
        });
    }
    /**
     * Dispatch a workflow for background execution. Returns immediately with
     * a `workflowRunId` that can be used to poll for status.
     *
     * The workflow runs on a `BackgroundTaskManager` worker — the main agent
     * event loop is NOT blocked.
     */
    dispatch(definition, options) {
        const runId = options.runId ?? `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const runStatus = {
            workflowRunId: runId,
            workflowName: definition.name,
            status: 'queued',
            dispatchedAt: Date.now(),
            totalSteps: definition.steps.length,
            stepsCompleted: 0,
        };
        this.runs.set(runId, runStatus);
        // Store definition and handlers for potential resume
        this.pausedRuns.set(runId, {
            definition,
            handlers: options.handlers,
            inputs: options.inputs,
            pauseContext: null, // Will be set on pause
        });
        this.eventStream?.append({
            type: 'workflow_dispatched',
            workflowRunId: runId,
            workflowName: definition.name,
        });
        // Wrap handlers to track step completion and handle pause.
        const wrappedHandlers = this.wrapHandlers(definition, runId, options.handlers);
        this.taskManager.addTask({
            id: runId,
            description: `workflow:${definition.name}`,
            priority: 5,
            execute: () => (0, runner_js_1.runWorkflow)(definition, {
                runId,
                inputs: options.inputs,
                handlers: wrappedHandlers,
            }),
        });
        return { workflowRunId: runId, status: 'queued' };
    }
    /**
     * Get the live status of a dispatched workflow run.
     * Returns `undefined` if the run id is unknown (or evicted).
     */
    getStatus(workflowRunId) {
        return this.runs.get(workflowRunId);
    }
    /**
     * Get the result of a completed workflow run.
     * Returns `null` if the run is still in progress, queued, or unknown.
     */
    getResult(workflowRunId) {
        const run = this.runs.get(workflowRunId);
        if (!run || run.status !== 'success')
            return null;
        return run.result ?? null;
    }
    /**
     * List all tracked runs (queued, running, completed, failed).
     * Ordered by dispatch time (newest first).
     */
    listRuns() {
        return Array.from(this.runs.values()).sort((a, b) => b.dispatchedAt - a.dispatchedAt);
    }
    /**
     * Pause a running workflow run (called by the runner when an interactive
     * loop needs user input). The run status is set to 'paused' and the pause
     * context is stored for later resume.
     */
    pause(workflowRunId, context) {
        const run = this.runs.get(workflowRunId);
        if (!run || run.status !== 'running')
            return false;
        run.status = 'paused';
        run.currentStep = context.stepId;
        // Store the pause context in the pausedRuns map
        const stored = this.pausedRuns.get(workflowRunId);
        if (stored) {
            stored.pauseContext = context;
        }
        this.eventStream?.append({
            type: 'workflow_run_completed',
            name: run.workflowName,
            runId: run.workflowRunId,
            status: 'paused',
            durationMs: 0,
            stepCount: run.totalSteps ?? 0,
        });
        return true;
    }
    /**
     * Resume a paused workflow run with user feedback. Re-dispatches the
     * workflow from where it left off, injecting the user's input.
     */
    resume(workflowRunId, userInput) {
        const run = this.runs.get(workflowRunId);
        if (!run || run.status !== 'paused')
            return null;
        const stored = this.pausedRuns.get(workflowRunId);
        if (!stored)
            return null;
        const pauseContext = stored.pauseContext;
        if (!pauseContext)
            return null;
        // Reset run status
        run.status = 'queued';
        run.startedAt = undefined;
        run.completedAt = undefined;
        run.durationMs = undefined;
        run.error = undefined;
        run.result = undefined;
        run.stepsCompleted = 0;
        // Wrap handlers with resume state
        const resumeHandlers = {
            ...stored.handlers,
            loopUserInput: async () => ({ input: userInput }),
        };
        const wrappedHandlers = this.wrapHandlers(stored.definition, workflowRunId, resumeHandlers);
        this.taskManager.addTask({
            id: workflowRunId,
            description: `workflow:${stored.definition.name}:resume`,
            priority: 5,
            execute: () => (0, runner_js_1.runWorkflow)(stored.definition, {
                runId: workflowRunId,
                inputs: stored.inputs,
                handlers: wrappedHandlers,
            }),
        });
        return { workflowRunId, status: 'queued' };
    }
    /**
     * Cancel a queued or running workflow run.
     * Queued runs are removed from the queue; running runs are marked as
     * cancelled (the actual LLM call is NOT interrupted — it will complete
     * but its result is discarded).
     */
    cancel(workflowRunId) {
        const run = this.runs.get(workflowRunId);
        if (!run)
            return false;
        if (run.status === 'queued' || run.status === 'running') {
            run.status = 'cancelled';
            run.completedAt = Date.now();
            run.durationMs = run.completedAt - run.dispatchedAt;
            this.eventStream?.append({
                type: 'workflow_run_completed',
                name: run.workflowName,
                runId: run.workflowRunId,
                status: 'cancelled',
                durationMs: run.durationMs,
                stepCount: run.totalSteps ?? 0,
            });
            return true;
        }
        return false;
    }
    // -----------------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------------
    /**
     * Wrap the caller's handlers to intercept step completions and update the
     * run status's `currentStep` / `stepsCompleted` fields.
     */
    wrapHandlers(definition, runId, original) {
        const run = this.runs.get(runId);
        const stepOrder = definition.steps.map((s) => s.id);
        let completedCount = 0;
        // We intercept the eventStream to watch for step-completed events.
        // The runner already emits these; we just mirror the count into the
        // run status.
        const originalAppend = original.eventStream?.append.bind(original.eventStream);
        const trackingStream = original.eventStream
            ? {
                append: (event) => {
                    if (event.type === 'workflow_step_completed' &&
                        event.runId === runId &&
                        run) {
                        completedCount++;
                        run.stepsCompleted = completedCount;
                        // Determine next step
                        const nextIdx = completedCount;
                        run.currentStep = nextIdx < stepOrder.length ? stepOrder[nextIdx] : undefined;
                    }
                    originalAppend?.(event);
                },
            }
            : undefined;
        // Wire pauseLoop to store the pause context and update run status.
        const pauseLoop = async (context) => {
            this.pause(runId, context);
        };
        return {
            ...original,
            eventStream: trackingStream,
            pauseLoop,
        };
    }
    /**
     * Evict oldest completed runs if we exceed `maxRetainedRuns`.
     */
    evictIfNeeded() {
        if (this.runs.size <= this.maxRetainedRuns)
            return;
        const sorted = Array.from(this.runs.entries()).sort((a, b) => (a[1].dispatchedAt) - (b[1].dispatchedAt));
        const toRemove = sorted.slice(0, sorted.length - this.maxRetainedRuns);
        for (const [id] of toRemove) {
            this.runs.delete(id);
        }
    }
}
exports.WorkflowDispatcher = WorkflowDispatcher;
//# sourceMappingURL=dispatcher.js.map