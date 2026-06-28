export { PermissionManager, type PermissionSource, type PermissionRule, type PermissionContext, type PermissionResult } from './permission-manager.js';

// Policy engine
export {
  PermissionEngine,
  readOnlyProfile,
  editFilesProfile,
  fullAccessProfile,
  customProfile,
} from './policy.js';
export type {
  PermissionDecision,
  PermissionMode,
  PermissionRule as PolicyRule,
  PermissionCondition,
  PermissionProfile,
} from './policy.js';

// Policy stack — three-level governance
export { PolicyStack, createPolicyStackFromConfig } from './policy-stack.js';
export type { PolicyLevel } from './policy-stack.js';

// Builtin policies
export {
  askOnOsTools,
  readOnlyPolicy,
  workspaceWritePolicy,
  trustedProjectPolicy,
  costBudgetPolicy,
  maxToolCallsPolicy,
  destructiveCommandsPolicy,
  networkPolicy,
  getBuiltinPolicyNames,
  createBuiltinPolicy,
} from './builtins.js';

// Blast radius — classify commands by reversibility
export {
  classifyBlastRadius,
  classifyChainedCommand,
  parseCommand,
} from './blast-radius.js';
export type { BlastRadius, BlastRadiusResult } from './blast-radius.js';
