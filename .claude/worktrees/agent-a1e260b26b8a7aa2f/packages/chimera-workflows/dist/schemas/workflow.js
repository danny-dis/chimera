"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowDefinitionSchema = exports.workflowBaseSchema = exports.workflowCostCapsSchema = exports.workflowWorktreePolicySchema = exports.workflowRequirementSchema = exports.webSearchModeSchema = exports.modelReasoningEffortSchema = void 0;
/**
 * Zod schemas for workflow definition types, plus result types for
 * workflow loading and execution (non-schema hand-written discriminated unions).
 *
 * Ported from research/archon/packages/workflows/src/schemas/workflow.ts @ 2026-06-15.
 *
 * Slimmed for chimera: dropped Claude SDK-only fields (fallbackModel, betas,
 * sandbox, interactive, persist_sessions, thinking) — chimera is provider-neutral.
 * Added `cost_caps: { per_task, per_session, per_day }` as a chimera-specific
 * per-workflow budget shape. Worktree policy is reduced to a single
 * `enabled: boolean` field for now.
 */
const zod_1 = require("zod");
const dag_node_js_1 = require("./dag-node.js");
// ---------------------------------------------------------------------------
// Shared enum schemas
// ---------------------------------------------------------------------------
exports.modelReasoningEffortSchema = zod_1.z.enum(['minimal', 'low', 'medium', 'high', 'xhigh']);
exports.webSearchModeSchema = zod_1.z.enum(['disabled', 'cached', 'live']);
/**
 * External capabilities a workflow declares it needs. Today only `github`
 * (the originating user must have connected their GitHub identity); the array
 * shape leaves room for `gitea`/`gitlab` etc. without a schema change.
 */
exports.workflowRequirementSchema = zod_1.z.enum(['github']);
// ---------------------------------------------------------------------------
// Workflow-level worktree policy
// ---------------------------------------------------------------------------
/**
 * Per-workflow worktree policy. Pins whether a run uses isolation regardless of
 * how it was invoked (CLI flags, web UI, chat). When the field is omitted the
 * caller's default applies — worktree for task/issue/pr, etc.
 *
 * Slimmed for chimera: only `enabled` for now. Other worktree-shaped settings
 * (copyFiles, initSubmodules, path, baseBranch) live in repo-level config
 * because they are repo-wide, not per-workflow. This block is deliberately
 * narrow to avoid re-expressing the repo-level knobs here.
 */
exports.workflowWorktreePolicySchema = zod_1.z.object({
    /**
     * Pin worktree isolation on or off for this workflow.
     * - `true`  — always run inside a worktree; CLI `--no-worktree` hard-errors
     * - `false` — always run in the live checkout; CLI `--branch` / `--from`
     *             hard-error, orchestrator skips isolation resolution
     * - omitted — caller decides (current default = worktree for most types)
     */
    enabled: zod_1.z.boolean().optional(),
});
// ---------------------------------------------------------------------------
// Per-workflow cost caps (chimera-specific)
// ---------------------------------------------------------------------------
/**
 * Chimera-specific per-workflow budget shape. Distinct from per-node
 * `cost_cap` in dag-node.ts — these apply at workflow scope. All fields are
 * USD; per_task caps a single AI call, per_session caps a single workflow run,
 * per_day caps all runs in a calendar day. Any field can be omitted; an omitted
 * field has no cap.
 */
exports.workflowCostCapsSchema = zod_1.z.object({
    per_task: zod_1.z.number().positive().optional(),
    per_session: zod_1.z.number().positive().optional(),
    per_day: zod_1.z.number().positive().optional(),
});
// ---------------------------------------------------------------------------
// WorkflowBase — common fields shared by all workflow types
// ---------------------------------------------------------------------------
exports.workflowBaseSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().min(1),
    provider: zod_1.z.string().trim().min(1).optional(),
    model: zod_1.z.string().optional(),
    modelReasoningEffort: exports.modelReasoningEffortSchema.optional(),
    webSearchMode: exports.webSearchModeSchema.optional(),
    additionalDirectories: zod_1.z.array(zod_1.z.string()).optional(),
    effort: dag_node_js_1.effortLevelSchema.optional(),
    worktree: exports.workflowWorktreePolicySchema.optional(),
    /**
     * When `false`, the engine skips the path-exclusive lock for this workflow,
     * allowing N concurrent runs on the same live checkout. The author asserts
     * that concurrent runs will not race (e.g. all writes are per-run-scoped).
     * Defaults to `true` (safe: serialize runs on the same path).
     */
    mutates_checkout: zod_1.z.boolean().optional(),
    tags: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    /**
     * External capabilities this workflow needs. When it includes `github`, the
     * run is hard-blocked at invocation (before any worktree/clone/AI cost) if
     * the originating user has not connected their GitHub identity. Only enforced
     * when per-user GitHub is enabled; a no-op for solo PAT installs.
     */
    requires: zod_1.z.array(exports.workflowRequirementSchema).optional(),
    /**
     * Chimera-specific per-workflow cost caps. Each field is optional; omit a
     * field to leave that scope uncapped.
     */
    cost_caps: exports.workflowCostCapsSchema.optional(),
});
// ---------------------------------------------------------------------------
// WorkflowDefinition — DAG-based workflow with nodes
// ---------------------------------------------------------------------------
/**
 * Workflow definition parsed from YAML.
 * All workflows use DAG-based execution with `nodes`.
 */
exports.workflowDefinitionSchema = exports.workflowBaseSchema.extend({
    nodes: zod_1.z.array(dag_node_js_1.dagNodeSchema),
});
//# sourceMappingURL=workflow.js.map