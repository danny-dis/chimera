/**
 * Bootstrap — the single entry point a host (CLI, TUI, tests) calls to
 * stand up a chimera runtime with all shipped defaults applied.
 *
 * The function is deliberately tiny. It exists so that the question
 * "what does it mean to start chimera?" has exactly one answer in
 * the codebase, and so future "always do this on startup" additions
 * have a clear, reviewable home.
 *
 * Current responsibilities:
 *   1. Construct a fresh `WorkflowRegistry`.
 *   2. Register every built-in workflow (standard-draft, quality-gate,
 *      parallel-decompose, simple-ask, simple-plan) into it.
 *   3. Emit a `workflow_registered` event for each, if an `EventStream`
 *      is supplied.
 *
 * It does NOT:
 *   - Load user workflows from `.chimera/workflows/*.yaml` — that is the
 *     caller's job (do it AFTER bootstrap so user workflows can override
 *     built-ins on name collision).
 *   - Load skills — `loadSkillsForMode` is per-mode and per-task, not a
 *     startup concern.
 *   - Construct an orchestrator or coordinator — those need provider
 *     configuration the host owns.
 */
import { EventStream } from './event-stream.js';
import { WorkflowRegistry } from './workflow/registry.js';
import { registerBuiltInWorkflows } from './workflow/builtins/index.js';
import type { Mode } from './types/agent.js';

export interface BootstrapResult {
  /** A fresh registry with every built-in workflow pre-registered. */
  workflowRegistry: WorkflowRegistry;
}

/**
 * Stand up a chimera runtime. Pure function: no module-level mutation,
 * no hidden state. Calling it twice gives two independent registries.
 */
export function bootstrap(opts: { eventStream?: EventStream } = {}): BootstrapResult {
  const eventStream = opts.eventStream;
  const workflowRegistry = new WorkflowRegistry();
  registerBuiltInWorkflows(workflowRegistry, eventStream);
  return { workflowRegistry };
}

/**
 * Convenience: pick the default workflow for a given mode. Equivalent
 * to `defaultWorkflowFor(mode)` but re-exported here so a host can
 * import everything from the bootstrap module if it wants.
 */
export { defaultWorkflowFor } from './workflow/builtins/index.js';

/**
 * Re-export the mode type so the bootstrap module is a self-contained
 * import surface.
 */
export type { Mode };
