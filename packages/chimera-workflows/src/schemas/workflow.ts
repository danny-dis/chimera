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
import { z } from 'zod';
import { dagNodeSchema, effortLevelSchema } from './dag-node.js';

// ---------------------------------------------------------------------------
// Shared enum schemas
// ---------------------------------------------------------------------------

export const modelReasoningEffortSchema = z.enum(['minimal', 'low', 'medium', 'high', 'xhigh']);

export type ModelReasoningEffort = z.infer<typeof modelReasoningEffortSchema>;

export const webSearchModeSchema = z.enum(['disabled', 'cached', 'live']);

/**
 * External capabilities a workflow declares it needs. Today only `github`
 * (the originating user must have connected their GitHub identity); the array
 * shape leaves room for `gitea`/`gitlab` etc. without a schema change.
 */
export const workflowRequirementSchema = z.enum(['github']);

export type WorkflowRequirement = z.infer<typeof workflowRequirementSchema>;

export type WebSearchMode = z.infer<typeof webSearchModeSchema>;

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
export const workflowWorktreePolicySchema = z.object({
  /**
   * Pin worktree isolation on or off for this workflow.
   * - `true`  — always run inside a worktree; CLI `--no-worktree` hard-errors
   * - `false` — always run in the live checkout; CLI `--branch` / `--from`
   *             hard-error, orchestrator skips isolation resolution
   * - omitted — caller decides (current default = worktree for most types)
   */
  enabled: z.boolean().optional(),
});

export type WorkflowWorktreePolicy = z.infer<typeof workflowWorktreePolicySchema>;

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
export const workflowCostCapsSchema = z.object({
  per_task: z.number().positive().optional(),
  per_session: z.number().positive().optional(),
  per_day: z.number().positive().optional(),
});

export type WorkflowCostCaps = z.infer<typeof workflowCostCapsSchema>;

// ---------------------------------------------------------------------------
// WorkflowBase — common fields shared by all workflow types
// ---------------------------------------------------------------------------

export const workflowBaseSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  provider: z.string().trim().min(1).optional(),
  model: z.string().optional(),
  modelReasoningEffort: modelReasoningEffortSchema.optional(),
  webSearchMode: webSearchModeSchema.optional(),
  additionalDirectories: z.array(z.string()).optional(),
  effort: effortLevelSchema.optional(),
  worktree: workflowWorktreePolicySchema.optional(),
  /**
   * When `false`, the engine skips the path-exclusive lock for this workflow,
   * allowing N concurrent runs on the same live checkout. The author asserts
   * that concurrent runs will not race (e.g. all writes are per-run-scoped).
   * Defaults to `true` (safe: serialize runs on the same path).
   */
  mutates_checkout: z.boolean().optional(),
  tags: z.array(z.string().min(1)).optional(),
  /**
   * External capabilities this workflow needs. When it includes `github`, the
   * run is hard-blocked at invocation (before any worktree/clone/AI cost) if
   * the originating user has not connected their GitHub identity. Only enforced
   * when per-user GitHub is enabled; a no-op for solo PAT installs.
   */
  requires: z.array(workflowRequirementSchema).optional(),
  /**
   * Chimera-specific per-workflow cost caps. Each field is optional; omit a
   * field to leave that scope uncapped.
   */
  cost_caps: workflowCostCapsSchema.optional(),
});

export type WorkflowBase = z.infer<typeof workflowBaseSchema>;

// ---------------------------------------------------------------------------
// WorkflowDefinition — DAG-based workflow with nodes
// ---------------------------------------------------------------------------

/**
 * Workflow definition parsed from YAML.
 * All workflows use DAG-based execution with `nodes`.
 */
export const workflowDefinitionSchema = workflowBaseSchema.extend({
  nodes: z.array(dagNodeSchema),
});

/** Workflow definition with fully typed nodes (DagNode[]) derived from the schema. */
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema> & { prompt?: never };

// ---------------------------------------------------------------------------
// LoadCommandResult — discriminated union for command load outcomes
// ---------------------------------------------------------------------------

/**
 * Result of loading a command prompt - discriminated union for specific error handling
 *
 * On success, `content` is non-empty (enforced at load time, not by the type).
 */
export type LoadCommandResult =
  | { success: true; content: string }
  | {
      success: false;
      reason: 'invalid_name' | 'empty_file' | 'not_found' | 'permission_denied' | 'read_error';
      message: string;
    };

// ---------------------------------------------------------------------------
// WorkflowExecutionResult — discriminated union for execution outcomes
// ---------------------------------------------------------------------------

/**
 * Result of workflow execution - allows callers to detect success/failure
 */
export type WorkflowExecutionResult =
  | { success: true; workflowRunId: string; summary?: string }
  | { success: false; workflowRunId?: string; error: string }
  | { success: true; paused: true; workflowRunId: string };

// ---------------------------------------------------------------------------
// WorkflowLoadError / WorkflowLoadResult — workflow discovery results
// ---------------------------------------------------------------------------

/**
 * Workflow origin:
 * - `bundled` — embedded in the chimera binary / bundled defaults
 * - `global`  — user-level, discovered at `~/.chimera/workflows/` (applies to every repo)
 * - `project` — repo-local, discovered at `<repoRoot>/.chimera/workflows/`
 *
 * Precedence for same-named files: `bundled` < `global` < `project`.
 */
export type WorkflowSource = 'bundled' | 'global' | 'project';

/** A workflow definition paired with its discovery source. */
export interface WorkflowWithSource {
  readonly workflow: WorkflowDefinition;
  readonly source: WorkflowSource;
}

/**
 * Error encountered while loading a workflow file
 */
export interface WorkflowLoadError {
  readonly filename: string;
  readonly error: string;
  readonly errorType: 'read_error' | 'parse_error' | 'validation_error';
}

/**
 * Result of workflow discovery - includes both successful loads and errors
 */
export interface WorkflowLoadResult {
  readonly workflows: readonly WorkflowWithSource[];
  readonly errors: readonly WorkflowLoadError[];
}
