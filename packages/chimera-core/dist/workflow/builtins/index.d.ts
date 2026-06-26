/**
 * Built-in workflows — auto-registered on every chimera launch.
 *
 * This module is the single source of truth for the workflow set that ships
 * with chimera. The CLI's bootstrap calls `registerBuiltInWorkflows(registry)`
 * once at startup; from that point on `chimera workflow list` surfaces them
 * alongside any user-defined workflows in `.chimera/workflows/`.
 *
 * ## The shipped set
 * - `standard-draft`     — writer → reviewer∥challenger → synthesize (default for code/debug)
 * - `quality-gate`       — reviewer → challenger → verdict (review an existing draft)
 * - `parallel-decompose` — decompose → sub-agent fan-out → aggregate (heavy fan-out)
 * - `simple-ask`         — single LLM call, no review (cheap Q&A)
 * - `simple-plan`        — single LLM call as planner, no execution (plan mode)
 *
 * ## Why a central registry?
 * Previously each subsystem (CoordinatorEngine, AgentMesh) registered its own
 * workflows in isolation. That made the set implicit, made ordering fragile,
 * and forced every caller to know which subsystem owned which workflow. This
 * module centralizes the registration; the subsystems still own the *code*
 * that runs the workflow, but the *registration* of the workflow as a
 * discoverable artifact lives here.
 *
 * ## Adding a new built-in
 * 1. Add a `WorkflowDefinition` to `BUILT_IN_WORKFLOWS`.
 * 2. If the workflow needs custom runtime support (e.g. a new step kind),
 *    add it to the appropriate executor (CoordinatorEngine, AgentMesh, or
 *    the orchestrator) — keep this file PURE DATA, no behavior.
 * 3. If the workflow should be the default for a mode, add the mapping to
 *    `DEFAULT_WORKFLOW_FOR_MODE` below.
 * 4. Add a test in `__tests__/builtins.test.ts`.
 */
import type { Mode } from '../../types/agent.js';
import type { WorkflowRegistry, WorkflowDefinition } from '../index.js';
/**
 * The full set of built-in workflows, in registration order. The order
 * matters for `chimera workflow list` (registration order is preserved)
 * and for the documented "first matching default wins" rule below.
 */
export declare const BUILT_IN_WORKFLOWS: ReadonlyArray<WorkflowDefinition>;
/**
 * Default workflow per mode. The orchestrator consults this map to pick
 * the right workflow when the user does not specify one explicitly.
 *
 * The map is intentionally a `Partial<Record<Mode, ...>>` — modes that
 * should fall through to the orchestrator's hardcoded default are
 * omitted. The orchestrator's fallback (currently `standard-draft`) is
 * what runs for unmapped modes.
 */
export declare const DEFAULT_WORKFLOW_FOR_MODE: Readonly<Partial<Record<Mode, string>>>;
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
export declare function registerBuiltInWorkflows(registry: WorkflowRegistry, eventStream?: {
    append: (e: any) => void;
}): void;
/**
 * Look up the default workflow name for a mode, falling back to
 * `'standard-draft'` if the mode is unmapped. Returns `null` if the
 * caller explicitly wants the orchestrator's hardcoded behavior.
 */
export declare function defaultWorkflowFor(mode: Mode): string;
//# sourceMappingURL=index.d.ts.map