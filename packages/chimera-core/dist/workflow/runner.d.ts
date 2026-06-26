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
import type { WorkflowDefinition, WorkflowStep, WorkflowContext, WorkflowRunResult, LoopPauseContext } from './types.js';
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
        messages: Array<{
            role: string;
            content: string;
        }>;
        options?: {
            temperature?: number;
            maxTokens?: number;
            responseFormat?: 'text' | 'json_object';
        };
        ctx: WorkflowContext;
    }) => Promise<{
        content: string;
        toolCalls?: ToolCall[];
        usage: {
            inputTokens: number;
            outputTokens: number;
        };
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
/**
 * Execute a workflow definition. Returns a `WorkflowRunResult` describing
 * the run. Never throws on a failed step — failures are surfaced via
 * `result.status === 'error'` and `result.error`.
 *
 * Concurrency: each top-level step is run sequentially in the order it
 * appears in `definition.steps`. Steps that internally fan out (e.g.
 * `parallel`) run their children concurrently and wait for all of them.
 */
export declare function runWorkflow(definition: WorkflowDefinition, options: RunWorkflowOptions): Promise<WorkflowRunResult>;
/**
 * Detect whether a completion signal string appears in the AI output.
 *
 * Two detection strategies (ported from archon's `detectCompletionSignal`):
 * 1. XML-wrapped: `<tag>SIGNAL</tag>` with matching open/close tag names,
 *    case-insensitive, whitespace-tolerant.
 * 2. Plain signal anywhere in the output (case-insensitive, trimmed).
 */
declare function detectCompletionSignal(output: string, signal: string): boolean;
interface LoopStepResult {
    content: string;
    iterations: number;
    completionDetected: boolean;
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
}
declare function runLoopStep(step: WorkflowStep, ctx: WorkflowContext, handlers: WorkflowHandlers, _outputs: Record<string, unknown>): Promise<LoopStepResult>;
export type { WorkflowDefinition, WorkflowStep, WorkflowContext, WorkflowRunResult };
export { runLoopStep, detectCompletionSignal };
//# sourceMappingURL=runner.d.ts.map