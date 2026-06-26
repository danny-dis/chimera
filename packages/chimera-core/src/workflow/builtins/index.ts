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
import type { WorkflowRegistry, WorkflowDefinition, WorkflowStep } from '../index.js';

// ---------------------------------------------------------------------------
// Pure-data definitions for the new built-ins. The existing
// `standard-draft` and `quality-gate` workflows are owned by the
// orchestrator / AgentMesh respectively; their data is registered below.
// ---------------------------------------------------------------------------

const SIMPLE_ASK_STEPS: WorkflowStep[] = [
  { id: 'writer', kind: 'llm', config: { role: 'writer', noToolLoop: true } },
];

const SIMPLE_PLAN_STEPS: WorkflowStep[] = [
  { id: 'planner', kind: 'llm', config: { role: 'planner', noToolLoop: true } },
  { id: 'gate', kind: 'gate', config: { passOn: 'PASS' } },
];

/**
 * The full set of built-in workflows, in registration order. The order
 * matters for `chimera workflow list` (registration order is preserved)
 * and for the documented "first matching default wins" rule below.
 */
export const BUILT_IN_WORKFLOWS: ReadonlyArray<WorkflowDefinition> = Object.freeze([
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
      { id: 'writer', kind: 'llm' as const, config: { role: 'writer', toolLoop: true } },
      {
        id: 'quality-gate',
        kind: 'parallel' as const,
        config: {
          branches: [
            { id: 'reviewer', kind: 'llm' as const, config: { role: 'reviewer' } },
            { id: 'challenger', kind: 'llm' as const, config: { role: 'challenger' } },
          ],
        },
      },
      { id: 'synthesize', kind: 'tool' as const, config: { tool: 'response-synthesizer' } },
    ],
  }),
  Object.freeze({
    name: 'quality-gate',
    description: 'Reviewer (LLM) → optional challenger (LLM) → verdict gate. Use to validate an existing draft.',
    tags: ['builtin', 'review'],
    steps: [
      { id: 'reviewer', kind: 'llm' as const, config: { role: 'reviewer' } },
      { id: 'challenge', kind: 'parallel' as const, config: { branches: [] } },
      { id: 'verdict', kind: 'gate' as const, config: { passOn: 'PASS' } },
    ],
  }),
  Object.freeze({
    name: 'parallel-decompose',
    description: 'Decompose task → fan-out sub-agents (dependency-aware) → aggregate. Heavy fan-out.',
    tags: ['builtin', 'coordinator', 'fan-out'],
    steps: [
      { id: 'decompose', kind: 'llm' as const, config: { role: 'decomposer' } },
      { id: 'spawn', kind: 'parallel' as const, config: { branches: [] } },
      { id: 'aggregate', kind: 'llm' as const, config: { role: 'aggregator' } },
    ],
  }),
]) as unknown as ReadonlyArray<WorkflowDefinition>;

/**
 * Default workflow per mode. The orchestrator consults this map to pick
 * the right workflow when the user does not specify one explicitly.
 *
 * The map is intentionally a `Partial<Record<Mode, ...>>` — modes that
 * should fall through to the orchestrator's hardcoded default are
 * omitted. The orchestrator's fallback (currently `standard-draft`) is
 * what runs for unmapped modes.
 */
export const DEFAULT_WORKFLOW_FOR_MODE: Readonly<Partial<Record<Mode, string>>> = Object.freeze({
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
export function registerBuiltInWorkflows(
  registry: WorkflowRegistry,
  eventStream?: { append: (e: any) => void },
): void {
  // New pure-data built-ins.
  for (const wf of BUILT_IN_WORKFLOWS) {
    registry.register(wf);
    emitRegistered(eventStream, wf.name, wf.steps.length, undefined);
  }
}

function emitRegistered(
  eventStream: { append: (e: unknown) => void } | undefined,
  name: string,
  stepCount: number,
  path: string | undefined,
): void {
  if (!eventStream) return;
  try {
    eventStream.append({ type: 'workflow_registered', name, stepCount, path });
  } catch {
    // Best-effort telemetry; never crash startup on event-stream issues.
  }
}

/**
 * Look up the default workflow name for a mode, falling back to
 * `'standard-draft'` if the mode is unmapped. Returns `null` if the
 * caller explicitly wants the orchestrator's hardcoded behavior.
 */
export function defaultWorkflowFor(mode: Mode): string {
  return DEFAULT_WORKFLOW_FOR_MODE[mode] ?? 'standard-draft';
}
