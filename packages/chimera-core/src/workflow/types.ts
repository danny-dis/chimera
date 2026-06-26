/**
 * Pure-data types for declarative workflows.
 *
 * A WorkflowDefinition is a list of steps that the orchestrator walks through
 * (llm / tool / parallel / sequence / gate). The actual execution engine lives
 * outside this module — these types describe the shape only.
 *
 * Keep this file dependency-free; consumers (loaders, registry, runner) build
 * on top of it.
 */

export type WorkflowStepKind = 'llm' | 'tool' | 'parallel' | 'sequence' | 'gate' | 'loop';

export interface WorkflowStep {
  /** Stable, human-readable identifier used in telemetry and gates. */
  id: string;
  /** Step kind — selects which executor interprets the payload. */
  kind: WorkflowStepKind;
  /** Free-form per-kind configuration. Validated by the runner. */
  config: Record<string, unknown>;
  /** When true, a step failure aborts the run; when false, the run continues. */
  required?: boolean;
}

/**
 * A single, declarative workflow. Pure data — `WorkflowRegistry` stores these.
 */
export interface WorkflowDefinition {
  /** Unique workflow name; the registry's primary key. */
  name: string;
  /** Short description shown in CLI / TUI surfaces. */
  description?: string;
  /** Ordered list of steps to execute. */
  steps: WorkflowStep[];
  /** Path the workflow was loaded from, if any. */
  path?: string;
  /** Free-form tags for filtering (e.g. "ci", "review"). */
  tags?: string[];
}

/**
 * Runtime context passed to each step. Populated by the runner; the registry
 * does not construct this.
 */
export interface WorkflowContext {
  runId: string;
  /** Mutable scratch space shared across steps. */
  state: Record<string, unknown>;
  /** Stable inputs supplied at run start. */
  inputs: Record<string, unknown>;
  /** Wall-clock start time, ms epoch — supplied by runner, not Date.now(). */
  startedAtMs: number;
}

/**
 * Result of a single workflow run.
 */
export interface WorkflowRunResult {
  runId: string;
  workflowName: string;
  status: 'success' | 'error' | 'cancelled' | 'paused';
  durationMs: number;
  stepCount: number;
  /** Per-step outputs keyed by step id. */
  outputs: Record<string, unknown>;
  /** First error message, if status === 'error'. */
  error?: string;
  /** Pause context for loop steps. */
  pauseContext?: LoopPauseContext;
}

/**
 * Live status of a dispatched (background) workflow run.
 * Returned by `WorkflowDispatcher.getStatus()` for polling.
 */
export interface WorkflowRunStatus {
  /** Unique run identifier. */
  workflowRunId: string;
  /** Name of the workflow definition being executed. */
  workflowName: string;
  /** Current lifecycle state. */
  status: 'queued' | 'running' | 'success' | 'error' | 'cancelled' | 'paused';
  /** Epoch-ms when the run was dispatched. */
  dispatchedAt: number;
  /** Epoch-ms when execution actually started (null while queued). */
  startedAt?: number;
  /** Epoch-ms when execution completed (null while running/queued). */
  completedAt?: number;
  /** Wall-clock duration in ms (null while running/queued). */
  durationMs?: number;
  /** Final result, available once status is 'success'. */
  result?: WorkflowRunResult;
  /** Error message, available once status is 'error'. */
  error?: string;
  /** Step id currently being executed (null if not running). */
  currentStep?: string;
  /** Number of top-level steps completed so far. */
  stepsCompleted?: number;
  /** Total number of top-level steps in the workflow. */
  totalSteps?: number;
  /** Pause context for loop steps. */
  pauseContext?: LoopPauseContext;
}

/**
 * Context for pausing a loop step.
 */
export interface LoopPauseContext {
  stepId: string;
  iteration: number;
  data: Record<string, unknown>;
}

/**
 * Schedule entry for recurring workflow runs.
 */
export interface ScheduleEntry {
  id: string;
  workflow: string;
  task?: string;
  cron: string;
  inputs: Record<string, unknown>;
  enabled: boolean;
  createdAt: number | string;
  lastRunAt?: number;
  nextRunAt?: number;
  maxIterations?: number;
}
