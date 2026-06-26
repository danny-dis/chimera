// @chimera/workflows — DAG-based workflow engine
// Public API is exported below; implementation files live in schemas/.

export {
  // Trigger rule
  triggerRuleSchema,
  TRIGGER_RULES,
  isTriggerRule,
  // Node schemas
  dagNodeBaseSchema,
  dagNodeSchema,
  commandNodeSchema,
  promptNodeSchema,
  bashNodeSchema,
  scriptNodeSchema,
  loopNodeSchema,
  approvalNodeSchema,
  cancelNodeSchema,
  approvalOnRejectSchema,
  // Provider-neutral option schemas
  effortLevelSchema,
  // AI-field warning lists
  BASH_NODE_AI_FIELDS,
  SCRIPT_NODE_AI_FIELDS,
  LOOP_NODE_AI_FIELDS,
  // Type guards
  isCommandNode,
  isPromptNode,
  isBashNode,
  isLoopNode,
  isApprovalNode,
  isCancelNode,
  isScriptNode,
  isPersistableNode,
} from './schemas/dag-node.js';

export type {
  // Trigger rule
  TriggerRule,
  EffortLevel,
  // Node base + variants
  DagNodeBase,
  DagNode,
  CommandNode,
  PromptNode,
  BashNode,
  ScriptNode,
  LoopNode,
  ApprovalNode,
  CancelNode,
  ApprovalOnReject,
} from './schemas/dag-node.js';

export {
  modelReasoningEffortSchema,
  webSearchModeSchema,
  workflowRequirementSchema,
  workflowWorktreePolicySchema,
  workflowCostCapsSchema,
  workflowBaseSchema,
  workflowDefinitionSchema,
} from './schemas/workflow.js';

export type {
  ModelReasoningEffort,
  WebSearchMode,
  WorkflowRequirement,
  WorkflowWorktreePolicy,
  WorkflowCostCaps,
  WorkflowBase,
  WorkflowDefinition,
  LoadCommandResult,
  WorkflowExecutionResult,
  WorkflowSource,
  WorkflowWithSource,
  WorkflowLoadError,
  WorkflowLoadResult,
} from './schemas/workflow.js';

export { loopNodeConfigSchema } from './schemas/loop.js';
export type { LoopNodeConfig } from './schemas/loop.js';

export { stepRetryConfigSchema } from './schemas/retry.js';
export type { StepRetryConfig } from './schemas/retry.js';

export { workflowNodeHooksSchema } from './schemas/hooks.js';
export type { WorkflowNodeHooks } from './schemas/hooks.js';
