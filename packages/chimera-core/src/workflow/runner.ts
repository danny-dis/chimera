/**
 * WorkflowRunner — pure, deterministic interpreter for `WorkflowDefinition`.
 *
 * The runner walks a workflow's `steps` array and dispatches each step to a
 * type-specific handler. Handlers receive a `WorkflowContext` (data) plus
 * a `WorkflowHandlers` object (the actual side-effecting primitives —
 * `llm.complete`, `toolExecutor.execute`, etc.). The runner itself never
 * imports an LLM client, never reads the filesystem, and never touches
 * global state — every side effect flows through the handlers.
 *
 * This is the seam that lets `SessionOrchestrator.execute()` delegate to a
 * declarative workflow without the runner knowing about prompt guards,
 * memory retrieval, or the synthesizer.
 *
 * Step kinds (initial set):
 *   - `llm`      — call the provider registered for the step's `role`
 *   - `tool`     — call the registered tool executor
 *   - `parallel` — fan-out across `config.branches` (Promise.allSettled)
 *   - `sequence` — serial sub-step list
 *   - `gate`     — evaluator function decides `success` vs `error`
 *
 * Per-step `config` is opaque to the runner; the handler for each kind
 * validates and reads whatever fields it needs. Unknown config keys are
 * ignored.
 */
import type { EventStream } from '../event-stream.js';
import type { LLMProvider } from '../session-orchestrator.js';
import type { ToolCall } from '../types/agent.js';
import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowContext,
  WorkflowRunResult,
  LoopPauseContext,
} from './types.js';

// ---------------------------------------------------------------------------
// Runtime context
// ---------------------------------------------------------------------------

/**
 * The execution-time context passed to every step handler. Built by the
 * caller (e.g. `SessionOrchestrator.execute()`) and supplied to
 * `runWorkflow()`.
 *
 * `state` and `inputs` are the data plane — shared mutable scratch space
 * and stable run inputs, respectively. `handlers` is the side-effect plane.
 */
export interface WorkflowHandlers {
  /** Map of `role` → LLMProvider. Steps look up the provider by `config.role`. */
  providers: Record<string, LLMProvider>;

  /** Tool executor — receives `(toolName, args)`. May be omitted for workflows without tool steps. */
  toolExecutor?: (toolName: string, args: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
    duration: number;
  }>;

  /**
   * Optional LLM call builder — the orchestrator may want to inject extra
   * behavior (e.g. a tool loop) around the bare `provider.complete` call.
   * If absent, the runner calls `providers[config.role].complete(...)`
   * directly with `{ role, content }` messages and the step's options.
   *
   * The `ctx` argument gives the caller access to the current
   * `WorkflowContext` (including `state`, which holds the outputs of
   * previously-completed steps). This is how the orchestrator builds
   * downstream prompts (e.g. the reviewer's prompt needs the writer's
   * draft output, which lives at `ctx.state['draft']`).
   */
  llmCaller?: (params: {
    role: string;
    messages: Array<{ role: string; content: string }>;
    options?: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: 'text' | 'json_object';
    };
    ctx: WorkflowContext;
  }) => Promise<{
    content: string;
    toolCalls?: ToolCall[];
    usage: { inputTokens: number; outputTokens: number };
  }>;

  /**
   * Optional gate evaluator. Receives the gate step's `config` and the
   * current `state`; returns 'success' to continue or 'error' to abort.
   * If absent, gates always return 'success'.
   */
  gateEvaluator?: (gate: WorkflowStep, state: Record<string, unknown>) => 'success' | 'error' | Promise<'success' | 'error'>;

  /**
   * Optional loop user input handler. Called when a loop step needs user input.
   */
  loopUserInput?: (context: LoopPauseContext) => Promise<Record<string, unknown>>;

  /**
   * Optional pause loop handler. Called when a loop step should pause.
   */
  pauseLoop?: (context: LoopPauseContext) => Promise<void>;

  /** Optional event stream — the runner appends `workflow_run_*` events here. */
  eventStream?: EventStream;
}

export interface RunWorkflowOptions {
  /** Stable run id; one is generated if not provided. */
  runId?: string;
  /** Initial state — merged into a fresh `{}`. */
  initialState?: Record<string, unknown>;
  /** Initial inputs — supplied to steps as `ctx.inputs`. */
  inputs?: Record<string, unknown>;
  /** Required: the side-effect handlers. */
  handlers: WorkflowHandlers;
}

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
export async function runWorkflow(
  definition: WorkflowDefinition,
  options: RunWorkflowOptions,
): Promise<WorkflowRunResult> {
  const start = Date.now();
  const runId = options.runId ?? `run-${start}-${Math.random().toString(36).slice(2, 8)}`;
  const ctx: WorkflowContext = {
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

  const outputs: Record<string, unknown> = {};
  let firstError: string | undefined;

  for (const step of definition.steps) {
    const stepStart = Date.now();
    let stepError: string | undefined;
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
    } catch (err) {
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

  const status: WorkflowRunResult['status'] = firstError ? 'error' : 'success';
  const result: WorkflowRunResult = {
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

async function runStep(
  step: WorkflowStep,
  ctx: WorkflowContext,
  handlers: WorkflowHandlers,
  outputs: Record<string, unknown>,
): Promise<unknown> {
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
      const exhaustive: never = step.kind;
      throw new Error(`WorkflowRunner: unknown step kind '${String(exhaustive)}'`);
    }
  }
}

// ---------------------------------------------------------------------------
// llm
// ---------------------------------------------------------------------------

async function runLlmStep(
  step: WorkflowStep,
  _ctx: WorkflowContext,
  handlers: WorkflowHandlers,
): Promise<{ content: string; parsed?: unknown; usage: { inputTokens: number; outputTokens: number } }> {
  const role = (step.config.role as string) ?? 'default';
  const provider = handlers.providers[role];
  if (!provider) {
    throw new Error(`WorkflowRunner: llm step '${step.id}' requested role '${role}' but no provider is registered for it`);
  }

  const messages = (step.config.messages as Array<{ role: string; content: string }>) ?? [
    { role: 'user', content: (step.config.prompt as string) ?? '' },
  ];
  const options = {
    temperature: (step.config.temperature as number | undefined) ?? 0.7,
    maxTokens: (step.config.maxTokens as number | undefined) ?? 4096,
    responseFormat: (step.config.responseFormat as 'text' | 'json_object' | undefined) ?? 'text',
  };

  const caller = handlers.llmCaller ?? ((p) => defaultLlmCaller(p, handlers));
  const result = await caller({ role, messages, options, ctx: _ctx });

  // Best-effort JSON parse: structured-output roles (writer, reviewer,
  // challenger) emit JSON; gates look up `.verdict` on the parsed object.
  // Failures are non-fatal — the raw content is still in `.content`.
  let parsed: unknown;
  try {
    const trimmed = result.content.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      parsed = JSON.parse(trimmed.slice(start, end + 1));
    }
  } catch {
    // Not JSON — return raw content only.
  }
  return { content: result.content, parsed, usage: result.usage };
}

async function defaultLlmCaller(
  params: {
    role: string;
    messages: Array<{ role: string; content: string }>;
    options?: { temperature?: number; maxTokens?: number; responseFormat?: 'text' | 'json_object' };
    ctx: WorkflowContext;
  },
  handlers: WorkflowHandlers,
): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }> {
  const provider = handlers.providers[params.role];
  if (!provider) {
    throw new Error(
      `WorkflowRunner.defaultLlmCaller: no provider registered for role '${params.role}'`,
    );
  }
  return provider.complete(params.messages, params.options);
}

// ---------------------------------------------------------------------------
// tool
// ---------------------------------------------------------------------------

async function runToolStep(
  step: WorkflowStep,
  _ctx: WorkflowContext,
  handlers: WorkflowHandlers,
): Promise<unknown> {
  const toolName = (step.config.name as string) ?? '';
  if (!toolName) {
    throw new Error(`WorkflowRunner: tool step '${step.id}' missing config.name`);
  }
  if (!handlers.toolExecutor) {
    throw new Error(`WorkflowRunner: tool step '${step.id}' requires a toolExecutor in handlers`);
  }
  const args = (step.config.args as Record<string, unknown>) ?? {};
  const result = await handlers.toolExecutor(toolName, args);
  if (!result.success) {
    throw new Error(`WorkflowRunner: tool '${toolName}' failed: ${result.error ?? 'unknown'}`);
  }
  return result.data ?? null;
}

// ---------------------------------------------------------------------------
// parallel
// ---------------------------------------------------------------------------

interface ParallelBranchResult {
  branchId: string;
  status: 'fulfilled' | 'rejected';
  value?: unknown;
  error?: string;
}

async function runParallelStep(
  step: WorkflowStep,
  ctx: WorkflowContext,
  handlers: WorkflowHandlers,
  outputs: Record<string, unknown>,
): Promise<{ branches: Record<string, unknown>; results: ParallelBranchResult[] }> {
  const branches = (step.config.branches as WorkflowStep[]) ?? [];
  if (branches.length === 0) {
    return { branches: {}, results: [] };
  }

  // Optional `reviewerFirst` config: a single branch is awaited first; if
  // its result equals `config.passOn`, the `dependentBranchIds` are not
  // invoked at all (saves the cost of calling the challenger when the
  // reviewer already passed).
  const reviewerFirst = step.config.reviewerFirst as
    | { branchId: string; passOn: string; dependentBranchIds: string[] }
    | undefined;

  if (reviewerFirst) {
    const reviewerBranch = branches.find((b) => b.id === reviewerFirst.branchId);
    if (!reviewerBranch) {
      throw new Error(
        `WorkflowRunner: parallel step '${step.id}' reviewerFirst.branchId='${reviewerFirst.branchId}' not found in branches`,
      );
    }
    const reviewerValue = await runStep(reviewerBranch, ctx, handlers, outputs);
    const reviewerVerdict = extractVerdict(reviewerValue);
    if (reviewerVerdict === reviewerFirst.passOn) {
      // Reviewer passed — skip dependents entirely. Their result is
      // surfaced as 'rejected' with a marker so callers can see why.
      const skipped: ParallelBranchResult[] = reviewerFirst.dependentBranchIds.map((id) => ({
        branchId: id,
        status: 'rejected',
        error: 'skipped: reviewer passed',
      }));
      const branchResults: Record<string, unknown> = {
        [reviewerBranch.id]: reviewerValue,
        ...Object.fromEntries(skipped.map((s) => [s.branchId, undefined])),
      };
      return { branches: branchResults, results: skipped };
    }
    // Reviewer did not pass — run dependents in parallel.
    const dependents = branches.filter((b) => reviewerFirst.dependentBranchIds.includes(b.id));
    const dependentSettled = await Promise.allSettled(
      dependents.map((b) => runStep(b, ctx, handlers, outputs)),
    );
    const dependentResults: ParallelBranchResult[] = dependentSettled.map((s, i) =>
      s.status === 'fulfilled'
        ? { branchId: dependents[i].id, status: 'fulfilled', value: s.value }
        : { branchId: dependents[i].id, status: 'rejected', error: errorMessage(s.reason) },
    );
    return {
      branches: {
        [reviewerBranch.id]: reviewerValue,
        ...Object.fromEntries(dependentResults.map((r) => [r.branchId, r.value])),
      },
      results: dependentResults,
    };
  }

  // Default path: fan-out across all branches concurrently.
  const settled = await Promise.allSettled(
    branches.map((b) => runStep(b, ctx, handlers, outputs)),
  );
  const results: ParallelBranchResult[] = settled.map((s, i) =>
    s.status === 'fulfilled'
      ? { branchId: branches[i].id, status: 'fulfilled', value: s.value }
      : { branchId: branches[i].id, status: 'rejected', error: errorMessage(s.reason) },
  );
  return {
    branches: Object.fromEntries(results.map((r) => [r.branchId, r.value])),
    results,
  };
}

function extractVerdict(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  // Check the top-level object first (when the LLM step's content is
  // already parsed JSON — the parsed object IS the value).
  const top = obj.verdict;
  if (typeof top === 'string') return top;
  // Fall back to a `parsed.verdict` (when the LLM step returned
  // `{ content, parsed, usage }` and the verdict is in the parsed object).
  const nested = obj.parsed as Record<string, unknown> | undefined;
  const inner = nested?.verdict;
  if (typeof inner === 'string') return inner;
  return undefined;
}

// ---------------------------------------------------------------------------
// sequence
// ---------------------------------------------------------------------------

async function runSequenceStep(
  step: WorkflowStep,
  ctx: WorkflowContext,
  handlers: WorkflowHandlers,
  outputs: Record<string, unknown>,
): Promise<unknown[]> {
  const subSteps = (step.config.steps as WorkflowStep[]) ?? [];
  const out: unknown[] = [];
  for (const sub of subSteps) {
    const v = await runStep(sub, ctx, handlers, outputs);
    out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// gate
// ---------------------------------------------------------------------------

async function runGateStep(
  step: WorkflowStep,
  ctx: WorkflowContext,
  handlers: WorkflowHandlers,
): Promise<{ status: 'success' | 'error'; reason?: string }> {
  if (!handlers.gateEvaluator) {
    return { status: 'success' };
  }
  const result = await handlers.gateEvaluator(step, ctx.state);
  if (result === 'error') {
    const reason = (step.config.reason as string | undefined) ?? `gate '${step.id}' rejected`;
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
function detectCompletionSignal(output: string, signal: string): boolean {
  if (!signal) return false;
  const s = signal.trim().toLowerCase();
  if (!s) return false;

  // Strategy 1: XML-wrapped — <tag>signal</tag> with matching tag names
  const xmlPattern = new RegExp(
    `<([a-zA-Z][a-zA-Z0-9]*)\\s*>\\s*${escapeRegExp(s)}\\s*</\\1\\s*>`,
    'i',
  );
  if (xmlPattern.test(output)) return true;

  // Strategy 2: plain signal anywhere in output (case-insensitive)
  return output.toLowerCase().includes(s);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface LoopStepResult {
  content: string;
  iterations: number;
  completionDetected: boolean;
  usage: { inputTokens: number; outputTokens: number };
}

async function runLoopStep(
  step: WorkflowStep,
  ctx: WorkflowContext,
  handlers: WorkflowHandlers,
  _outputs: Record<string, unknown>,
): Promise<LoopStepResult> {
  const config = step.config;
  const prompt = (config.prompt as string) ?? '';
  const until = (config.until as string) ?? '';
  const maxIterations = (config.max_iterations as number) ?? 10;
  const freshContext = (config.fresh_context as boolean) ?? false;
  const untilBash = config.until_bash as string | undefined;

  if (!prompt) {
    throw new Error(`WorkflowRunner: loop step '${step.id}' missing config.prompt`);
  }
  if (!until) {
    throw new Error(`WorkflowRunner: loop step '${step.id}' missing config.until`);
  }
  if (maxIterations < 1) {
    throw new Error(`WorkflowRunner: loop step '${step.id}' max_iterations must be >= 1`);
  }

  const role = (config.role as string) ?? 'default';
  const provider = handlers.providers[role];
  if (!provider) {
    throw new Error(
      `WorkflowRunner: loop step '${step.id}' requested role '${role}' but no provider is registered for it`,
    );
  }

  const caller = handlers.llmCaller ?? ((p) => defaultLlmCaller(p, handlers));
  const eventStream = handlers.eventStream;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastOutput = '';
  const history: Array<{ role: string; content: string }> = [];

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
    const messages: Array<{ role: string; content: string }> = freshContext
      ? [{ role: 'user', content: prompt }]
      : [...history, { role: 'user', content: prompt }];

    let content: string;
    let usage: { inputTokens: number; outputTokens: number };
    try {
      const result = await caller({
        role,
        messages,
        options: { temperature: 0.7, maxTokens: 4096 },
        ctx,
      });
      content = result.content;
      usage = result.usage;
    } catch (err) {
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
      throw new Error(
        `WorkflowRunner: loop step '${step.id}' iteration ${i} failed: ${error}`,
      );
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
      } catch {
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
  throw new Error(
    `WorkflowRunner: loop step '${step.id}' exceeded max iterations (${maxIterations}) without completion signal '${until}'`,
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

// Re-export for consumers that only import from the workflow barrel.
export type { WorkflowDefinition, WorkflowStep, WorkflowContext, WorkflowRunResult };

// Export loop helpers for direct use by command handlers.
export { runLoopStep, detectCompletionSignal };
