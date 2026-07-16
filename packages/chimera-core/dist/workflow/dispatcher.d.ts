import type { EventStream } from '../event-stream.js';
import type { WorkflowDefinition, LoopPauseContext } from './types.js';
import type { WorkflowRunResult, WorkflowRunStatus } from './types.js';
import type { WorkflowHandlers } from './runner.js';
export interface DispatchOptions {
    /** Initial inputs supplied to the workflow run context. */
    inputs?: Record<string, unknown>;
    /** Required: side-effect handlers for LLM calls, tools, gates, etc. */
    handlers: WorkflowHandlers;
    /** Optional stable run id; one is generated if not provided. */
    runId?: string;
}
export interface DispatchResult {
    /** Unique identifier for the dispatched run. */
    workflowRunId: string;
    /** Always 'queued' on successful dispatch. */
    status: 'queued';
}
export interface WorkflowDispatcherOptions {
    /** Max concurrent workflow runs (default: 4). */
    maxConcurrency?: number;
    /** Event stream for telemetry and TUI integration. */
    eventStream?: EventStream;
    /** Max completed runs to retain in memory (default: 100). Older runs are evicted. */
    maxRetainedRuns?: number;
    /** Workspace root for background-task persistence (`.chimera/background-tasks.json`). */
    workspaceRoot?: string;
}
export declare class WorkflowDispatcher {
    private readonly taskManager;
    private readonly runs;
    private readonly pausedRuns;
    private readonly eventStream?;
    private readonly maxRetainedRuns;
    constructor(options?: WorkflowDispatcherOptions);
    /**
     * Dispatch a workflow for background execution. Returns immediately with
     * a `workflowRunId` that can be used to poll for status.
     *
     * The workflow runs on a `BackgroundTaskManager` worker — the main agent
     * event loop is NOT blocked.
     */
    dispatch(definition: WorkflowDefinition, options: DispatchOptions): DispatchResult;
    /**
     * Get the live status of a dispatched workflow run.
     * Returns `undefined` if the run id is unknown (or evicted).
     */
    getStatus(workflowRunId: string): WorkflowRunStatus | undefined;
    /**
     * Get the result of a completed workflow run.
     * Returns `null` if the run is still in progress, queued, or unknown.
     */
    getResult(workflowRunId: string): WorkflowRunResult | null;
    /**
     * List all tracked runs (queued, running, completed, failed).
     * Ordered by dispatch time (newest first).
     */
    listRuns(): WorkflowRunStatus[];
    /**
     * Pause a running workflow run (called by the runner when an interactive
     * loop needs user input). The run status is set to 'paused' and the pause
     * context is stored for later resume.
     */
    pause(workflowRunId: string, context: LoopPauseContext): boolean;
    /**
     * Resume a paused workflow run with user feedback. Re-dispatches the
     * workflow from where it left off, injecting the user's input.
     */
    resume(workflowRunId: string, userInput: string): DispatchResult | null;
    /**
     * Cancel a queued or running workflow run.
     * Queued runs are removed from the queue; running runs are marked as
     * cancelled (the actual LLM call is NOT interrupted — it will complete
     * but its result is discarded).
     */
    cancel(workflowRunId: string): boolean;
    /**
     * Wrap the caller's handlers to intercept step completions and update the
     * run status's `currentStep` / `stepsCompleted` fields.
     */
    private wrapHandlers;
    /**
     * Evict oldest completed runs if we exceed `maxRetainedRuns`.
     */
    private evictIfNeeded;
}
//# sourceMappingURL=dispatcher.d.ts.map