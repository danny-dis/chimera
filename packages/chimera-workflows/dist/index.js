"use strict";
// @chimera/workflows — DAG-based workflow engine
// Public API is exported below; implementation files live in schemas/.
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowNodeHooksSchema = exports.stepRetryConfigSchema = exports.loopNodeConfigSchema = exports.workflowDefinitionSchema = exports.workflowBaseSchema = exports.workflowCostCapsSchema = exports.workflowWorktreePolicySchema = exports.workflowRequirementSchema = exports.webSearchModeSchema = exports.modelReasoningEffortSchema = exports.isPersistableNode = exports.isScriptNode = exports.isCancelNode = exports.isApprovalNode = exports.isLoopNode = exports.isBashNode = exports.isPromptNode = exports.isCommandNode = exports.LOOP_NODE_AI_FIELDS = exports.SCRIPT_NODE_AI_FIELDS = exports.BASH_NODE_AI_FIELDS = exports.effortLevelSchema = exports.approvalOnRejectSchema = exports.cancelNodeSchema = exports.approvalNodeSchema = exports.loopNodeSchema = exports.scriptNodeSchema = exports.bashNodeSchema = exports.promptNodeSchema = exports.commandNodeSchema = exports.dagNodeSchema = exports.dagNodeBaseSchema = exports.isTriggerRule = exports.TRIGGER_RULES = exports.triggerRuleSchema = void 0;
var dag_node_js_1 = require("./schemas/dag-node.js");
// Trigger rule
Object.defineProperty(exports, "triggerRuleSchema", { enumerable: true, get: function () { return dag_node_js_1.triggerRuleSchema; } });
Object.defineProperty(exports, "TRIGGER_RULES", { enumerable: true, get: function () { return dag_node_js_1.TRIGGER_RULES; } });
Object.defineProperty(exports, "isTriggerRule", { enumerable: true, get: function () { return dag_node_js_1.isTriggerRule; } });
// Node schemas
Object.defineProperty(exports, "dagNodeBaseSchema", { enumerable: true, get: function () { return dag_node_js_1.dagNodeBaseSchema; } });
Object.defineProperty(exports, "dagNodeSchema", { enumerable: true, get: function () { return dag_node_js_1.dagNodeSchema; } });
Object.defineProperty(exports, "commandNodeSchema", { enumerable: true, get: function () { return dag_node_js_1.commandNodeSchema; } });
Object.defineProperty(exports, "promptNodeSchema", { enumerable: true, get: function () { return dag_node_js_1.promptNodeSchema; } });
Object.defineProperty(exports, "bashNodeSchema", { enumerable: true, get: function () { return dag_node_js_1.bashNodeSchema; } });
Object.defineProperty(exports, "scriptNodeSchema", { enumerable: true, get: function () { return dag_node_js_1.scriptNodeSchema; } });
Object.defineProperty(exports, "loopNodeSchema", { enumerable: true, get: function () { return dag_node_js_1.loopNodeSchema; } });
Object.defineProperty(exports, "approvalNodeSchema", { enumerable: true, get: function () { return dag_node_js_1.approvalNodeSchema; } });
Object.defineProperty(exports, "cancelNodeSchema", { enumerable: true, get: function () { return dag_node_js_1.cancelNodeSchema; } });
Object.defineProperty(exports, "approvalOnRejectSchema", { enumerable: true, get: function () { return dag_node_js_1.approvalOnRejectSchema; } });
// Provider-neutral option schemas
Object.defineProperty(exports, "effortLevelSchema", { enumerable: true, get: function () { return dag_node_js_1.effortLevelSchema; } });
// AI-field warning lists
Object.defineProperty(exports, "BASH_NODE_AI_FIELDS", { enumerable: true, get: function () { return dag_node_js_1.BASH_NODE_AI_FIELDS; } });
Object.defineProperty(exports, "SCRIPT_NODE_AI_FIELDS", { enumerable: true, get: function () { return dag_node_js_1.SCRIPT_NODE_AI_FIELDS; } });
Object.defineProperty(exports, "LOOP_NODE_AI_FIELDS", { enumerable: true, get: function () { return dag_node_js_1.LOOP_NODE_AI_FIELDS; } });
// Type guards
Object.defineProperty(exports, "isCommandNode", { enumerable: true, get: function () { return dag_node_js_1.isCommandNode; } });
Object.defineProperty(exports, "isPromptNode", { enumerable: true, get: function () { return dag_node_js_1.isPromptNode; } });
Object.defineProperty(exports, "isBashNode", { enumerable: true, get: function () { return dag_node_js_1.isBashNode; } });
Object.defineProperty(exports, "isLoopNode", { enumerable: true, get: function () { return dag_node_js_1.isLoopNode; } });
Object.defineProperty(exports, "isApprovalNode", { enumerable: true, get: function () { return dag_node_js_1.isApprovalNode; } });
Object.defineProperty(exports, "isCancelNode", { enumerable: true, get: function () { return dag_node_js_1.isCancelNode; } });
Object.defineProperty(exports, "isScriptNode", { enumerable: true, get: function () { return dag_node_js_1.isScriptNode; } });
Object.defineProperty(exports, "isPersistableNode", { enumerable: true, get: function () { return dag_node_js_1.isPersistableNode; } });
var workflow_js_1 = require("./schemas/workflow.js");
Object.defineProperty(exports, "modelReasoningEffortSchema", { enumerable: true, get: function () { return workflow_js_1.modelReasoningEffortSchema; } });
Object.defineProperty(exports, "webSearchModeSchema", { enumerable: true, get: function () { return workflow_js_1.webSearchModeSchema; } });
Object.defineProperty(exports, "workflowRequirementSchema", { enumerable: true, get: function () { return workflow_js_1.workflowRequirementSchema; } });
Object.defineProperty(exports, "workflowWorktreePolicySchema", { enumerable: true, get: function () { return workflow_js_1.workflowWorktreePolicySchema; } });
Object.defineProperty(exports, "workflowCostCapsSchema", { enumerable: true, get: function () { return workflow_js_1.workflowCostCapsSchema; } });
Object.defineProperty(exports, "workflowBaseSchema", { enumerable: true, get: function () { return workflow_js_1.workflowBaseSchema; } });
Object.defineProperty(exports, "workflowDefinitionSchema", { enumerable: true, get: function () { return workflow_js_1.workflowDefinitionSchema; } });
var loop_js_1 = require("./schemas/loop.js");
Object.defineProperty(exports, "loopNodeConfigSchema", { enumerable: true, get: function () { return loop_js_1.loopNodeConfigSchema; } });
var retry_js_1 = require("./schemas/retry.js");
Object.defineProperty(exports, "stepRetryConfigSchema", { enumerable: true, get: function () { return retry_js_1.stepRetryConfigSchema; } });
var hooks_js_1 = require("./schemas/hooks.js");
Object.defineProperty(exports, "workflowNodeHooksSchema", { enumerable: true, get: function () { return hooks_js_1.workflowNodeHooksSchema; } });
//# sourceMappingURL=index.js.map