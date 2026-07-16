// @chimera/core/workflow — declarative workflow types, registry, and YAML/JSON loader

export type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowStepKind,
  WorkflowContext,
  WorkflowRunResult,
  WorkflowRunStatus,
} from './types.js';

export { WorkflowRegistry } from './registry.js';
export { WorkflowLoader, WorkflowAutoLoader } from './loader.js';
export { workflowLoaderSchema } from './loader.js';

// Runner — pure interpreter; no LLM/IO of its own, all side effects via handlers.
export { runWorkflow } from './runner.js';
export { SchedulerManager, parseCron, matchesCron } from './scheduler.js';
export type { WorkflowHandlers, RunWorkflowOptions } from './runner.js';

// Loop helpers — exported for direct use by command handlers.
export { runLoopStep, detectCompletionSignal } from './runner.js';

// Dispatcher — background execution engine for workflows.
export { WorkflowDispatcher } from './dispatcher.js';
export type { DispatchOptions, DispatchResult, WorkflowDispatcherOptions } from './dispatcher.js';

// Built-ins — the workflow set that ships with chimera. Auto-registered on
// every CLI launch via `registerBuiltInWorkflows(registry, eventStream)`.
export {
  BUILT_IN_WORKFLOWS,
  DEFAULT_WORKFLOW_FOR_MODE,
  registerBuiltInWorkflows,
  defaultWorkflowFor,
} from './builtins/index.js';
