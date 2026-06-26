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
import { BackgroundTaskManager } from '../agent/background-task-manager.js';
import type { EventStream } from '../event-stream.js';
import type { WorkflowDefinition, LoopPauseContext } from './types.js';
import type { WorkflowRunResult, WorkflowRunStatus } from './types.js';
import type { WorkflowHandlers } from './runner.js';
import { runWorkflow } from './runner.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

interface PausedRunState {
  definition: WorkflowDefinition;
  handlers: WorkflowHandlers;
  inputs?: Record<string, unknown>;
  pauseContext: LoopPauseContext;
}

export class WorkflowDispatcher {
  private readonly taskManager: BackgroundTaskManager;
  private readonly runs: Map<string, WorkflowRunStatus> = new Map();
  private readonly pausedRuns: Map<string, PausedRunState> = new Map();
  private readonly eventStream?: EventStream;
  private readonly maxRetainedRuns: number;

  constructor(options?: WorkflowDispatcherOptions) {
    this.taskManager = new BackgroundTaskManager(options?.maxConcurrency ?? 4);
    this.eventStream = options?.eventStream;
    this.maxRetainedRuns = options?.maxRetainedRuns ?? 100;

    // Wire task-manager lifecycle events → update run status.
    this.taskManager.on('task_started', (task: any) => {
      const run = this.runs.get(task.id);
      if (run) {
        run.status = 'running';
        run.startedAt = Date.now();
      }
    });

    this.taskManager.on('task_completed', (task: any) => {
      const run = this.runs.get(task.id);
      if (run) {
        const result = task.result as WorkflowRunResult;

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
            type: 'workflow_dispatch_failed' as any,
            workflowRunId: run.workflowRunId,
            workflowName: run.workflowName,
            error: run.error,
          } as any);
        } else {
          run.status = 'success';
          run.completedAt = Date.now();
          run.durationMs = run.completedAt - (run.startedAt ?? run.dispatchedAt);
          run.result = result;
          run.stepsCompleted = run.totalSteps;

          this.eventStream?.append({
            type: 'workflow_run_completed' as any,
            name: run.workflowName,
            runId: run.workflowRunId,
            status: 'success',
            durationMs: run.durationMs,
            stepCount: run.totalSteps ?? 0,
          } as any);
        }

        this.evictIfNeeded();
      }
    });

    this.taskManager.on('task_failed', (task: any) => {
      const run = this.runs.get(task.id);
      if (run) {
        run.status = 'error';
        run.completedAt = Date.now();
        run.durationMs = run.completedAt - (run.startedAt ?? run.dispatchedAt);
        run.error = task.error ?? 'unknown error';

        this.eventStream?.append({
          type: 'workflow_dispatch_failed' as any,
          workflowRunId: run.workflowRunId,
          workflowName: run.workflowName,
          error: run.error,
        } as any);

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
  dispatch(definition: WorkflowDefinition, options: DispatchOptions): DispatchResult {
    const runId = options.runId ?? `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const runStatus: WorkflowRunStatus = {
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
      pauseContext: null as any, // Will be set on pause
    });

    this.eventStream?.append({
      type: 'workflow_dispatched' as any,
      workflowRunId: runId,
      workflowName: definition.name,
    } as any);

    // Wrap handlers to track step completion and handle pause.
    const wrappedHandlers = this.wrapHandlers(definition, runId, options.handlers);

    this.taskManager.addTask({
      id: runId,
      description: `workflow:${definition.name}`,
      priority: 5,
      execute: () =>
        runWorkflow(definition, {
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
  getStatus(workflowRunId: string): WorkflowRunStatus | undefined {
    return this.runs.get(workflowRunId);
  }

  /**
   * Get the result of a completed workflow run.
   * Returns `null` if the run is still in progress, queued, or unknown.
   */
  getResult(workflowRunId: string): WorkflowRunResult | null {
    const run = this.runs.get(workflowRunId);
    if (!run || run.status !== 'success') return null;
    return run.result ?? null;
  }

  /**
   * List all tracked runs (queued, running, completed, failed).
   * Ordered by dispatch time (newest first).
   */
  listRuns(): WorkflowRunStatus[] {
    return Array.from(this.runs.values()).sort(
      (a, b) => b.dispatchedAt - a.dispatchedAt,
    );
  }

  /**
   * Pause a running workflow run (called by the runner when an interactive
   * loop needs user input). The run status is set to 'paused' and the pause
   * context is stored for later resume.
   */
  pause(workflowRunId: string, context: LoopPauseContext): boolean {
    const run = this.runs.get(workflowRunId);
    if (!run || run.status !== 'running') return false;

    run.status = 'paused';
    run.currentStep = context.stepId;

    // Store the pause context in the pausedRuns map
    const stored = this.pausedRuns.get(workflowRunId);
    if (stored) {
      stored.pauseContext = context;
    }

    this.eventStream?.append({
      type: 'workflow_run_completed' as any,
      name: run.workflowName,
      runId: run.workflowRunId,
      status: 'paused' as any,
      durationMs: 0,
      stepCount: run.totalSteps ?? 0,
    } as any);

    return true;
  }

  /**
   * Resume a paused workflow run with user feedback. Re-dispatches the
   * workflow from where it left off, injecting the user's input.
   */
  resume(workflowRunId: string, userInput: string): DispatchResult | null {
    const run = this.runs.get(workflowRunId);
    if (!run || run.status !== 'paused') return null;

    const stored = this.pausedRuns.get(workflowRunId);
    if (!stored) return null;

    const pauseContext = stored.pauseContext;
    if (!pauseContext) return null;

    // Reset run status
    run.status = 'queued';
    run.startedAt = undefined;
    run.completedAt = undefined;
    run.durationMs = undefined;
    run.error = undefined;
    run.result = undefined;
    run.stepsCompleted = 0;

    // Wrap handlers with resume state
    const resumeHandlers: WorkflowHandlers = {
      ...stored.handlers,
      loopUserInput: async () => ({ input: userInput }),
    };

    const wrappedHandlers = this.wrapHandlers(stored.definition, workflowRunId, resumeHandlers);

    this.taskManager.addTask({
      id: workflowRunId,
      description: `workflow:${stored.definition.name}:resume`,
      priority: 5,
      execute: () =>
        runWorkflow(stored.definition, {
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
  cancel(workflowRunId: string): boolean {
    const run = this.runs.get(workflowRunId);
    if (!run) return false;

    if (run.status === 'queued' || run.status === 'running') {
      run.status = 'cancelled';
      run.completedAt = Date.now();
      run.durationMs = run.completedAt - run.dispatchedAt;

      this.eventStream?.append({
        type: 'workflow_run_completed' as any,
        name: run.workflowName,
        runId: run.workflowRunId,
        status: 'cancelled',
        durationMs: run.durationMs,
        stepCount: run.totalSteps ?? 0,
      } as any);

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
  private wrapHandlers(
    definition: WorkflowDefinition,
    runId: string,
    original: WorkflowHandlers,
  ): WorkflowHandlers {
    const run = this.runs.get(runId);
    const stepOrder = definition.steps.map((s) => s.id);
    let completedCount = 0;

    // We intercept the eventStream to watch for step-completed events.
    // The runner already emits these; we just mirror the count into the
    // run status.
    const originalAppend = original.eventStream?.append.bind(original.eventStream);

    const trackingStream = original.eventStream
      ? {
          append: (event: any) => {
            if (
              event.type === 'workflow_step_completed' &&
              event.runId === runId &&
              run
            ) {
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
    const pauseLoop = async (context: LoopPauseContext) => {
      this.pause(runId, context);
    };

    return {
      ...original,
      eventStream: trackingStream as any,
      pauseLoop,
    };
  }

  /**
   * Evict oldest completed runs if we exceed `maxRetainedRuns`.
   */
  private evictIfNeeded(): void {
    if (this.runs.size <= this.maxRetainedRuns) return;

    const sorted = Array.from(this.runs.entries()).sort(
      (a, b) => (a[1].dispatchedAt) - (b[1].dispatchedAt),
    );
    const toRemove = sorted.slice(0, sorted.length - this.maxRetainedRuns);
    for (const [id] of toRemove) {
      this.runs.delete(id);
    }
  }
}
