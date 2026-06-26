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
export declare const modelReasoningEffortSchema: z.ZodEnum<["minimal", "low", "medium", "high", "xhigh"]>;
export type ModelReasoningEffort = z.infer<typeof modelReasoningEffortSchema>;
export declare const webSearchModeSchema: z.ZodEnum<["disabled", "cached", "live"]>;
/**
 * External capabilities a workflow declares it needs. Today only `github`
 * (the originating user must have connected their GitHub identity); the array
 * shape leaves room for `gitea`/`gitlab` etc. without a schema change.
 */
export declare const workflowRequirementSchema: z.ZodEnum<["github"]>;
export type WorkflowRequirement = z.infer<typeof workflowRequirementSchema>;
export type WebSearchMode = z.infer<typeof webSearchModeSchema>;
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
export declare const workflowWorktreePolicySchema: z.ZodObject<{
    /**
     * Pin worktree isolation on or off for this workflow.
     * - `true`  — always run inside a worktree; CLI `--no-worktree` hard-errors
     * - `false` — always run in the live checkout; CLI `--branch` / `--from`
     *             hard-error, orchestrator skips isolation resolution
     * - omitted — caller decides (current default = worktree for most types)
     */
    enabled: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    enabled?: boolean;
}, {
    enabled?: boolean;
}>;
export type WorkflowWorktreePolicy = z.infer<typeof workflowWorktreePolicySchema>;
/**
 * Chimera-specific per-workflow budget shape. Distinct from per-node
 * `cost_cap` in dag-node.ts — these apply at workflow scope. All fields are
 * USD; per_task caps a single AI call, per_session caps a single workflow run,
 * per_day caps all runs in a calendar day. Any field can be omitted; an omitted
 * field has no cap.
 */
export declare const workflowCostCapsSchema: z.ZodObject<{
    per_task: z.ZodOptional<z.ZodNumber>;
    per_session: z.ZodOptional<z.ZodNumber>;
    per_day: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    per_task?: number;
    per_session?: number;
    per_day?: number;
}, {
    per_task?: number;
    per_session?: number;
    per_day?: number;
}>;
export type WorkflowCostCaps = z.infer<typeof workflowCostCapsSchema>;
export declare const workflowBaseSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    provider: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    modelReasoningEffort: z.ZodOptional<z.ZodEnum<["minimal", "low", "medium", "high", "xhigh"]>>;
    webSearchMode: z.ZodOptional<z.ZodEnum<["disabled", "cached", "live"]>>;
    additionalDirectories: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    effort: z.ZodOptional<z.ZodEnum<["low", "medium", "high", "max"]>>;
    worktree: z.ZodOptional<z.ZodObject<{
        /**
         * Pin worktree isolation on or off for this workflow.
         * - `true`  — always run inside a worktree; CLI `--no-worktree` hard-errors
         * - `false` — always run in the live checkout; CLI `--branch` / `--from`
         *             hard-error, orchestrator skips isolation resolution
         * - omitted — caller decides (current default = worktree for most types)
         */
        enabled: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        enabled?: boolean;
    }, {
        enabled?: boolean;
    }>>;
    /**
     * When `false`, the engine skips the path-exclusive lock for this workflow,
     * allowing N concurrent runs on the same live checkout. The author asserts
     * that concurrent runs will not race (e.g. all writes are per-run-scoped).
     * Defaults to `true` (safe: serialize runs on the same path).
     */
    mutates_checkout: z.ZodOptional<z.ZodBoolean>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /**
     * External capabilities this workflow needs. When it includes `github`, the
     * run is hard-blocked at invocation (before any worktree/clone/AI cost) if
     * the originating user has not connected their GitHub identity. Only enforced
     * when per-user GitHub is enabled; a no-op for solo PAT installs.
     */
    requires: z.ZodOptional<z.ZodArray<z.ZodEnum<["github"]>, "many">>;
    /**
     * Chimera-specific per-workflow cost caps. Each field is optional; omit a
     * field to leave that scope uncapped.
     */
    cost_caps: z.ZodOptional<z.ZodObject<{
        per_task: z.ZodOptional<z.ZodNumber>;
        per_session: z.ZodOptional<z.ZodNumber>;
        per_day: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        per_task?: number;
        per_session?: number;
        per_day?: number;
    }, {
        per_task?: number;
        per_session?: number;
        per_day?: number;
    }>>;
}, "strip", z.ZodTypeAny, {
    model?: string;
    provider?: string;
    name?: string;
    description?: string;
    modelReasoningEffort?: "low" | "medium" | "high" | "minimal" | "xhigh";
    webSearchMode?: "disabled" | "cached" | "live";
    additionalDirectories?: string[];
    effort?: "low" | "medium" | "high" | "max";
    worktree?: {
        enabled?: boolean;
    };
    mutates_checkout?: boolean;
    tags?: string[];
    requires?: "github"[];
    cost_caps?: {
        per_task?: number;
        per_session?: number;
        per_day?: number;
    };
}, {
    model?: string;
    provider?: string;
    name?: string;
    description?: string;
    modelReasoningEffort?: "low" | "medium" | "high" | "minimal" | "xhigh";
    webSearchMode?: "disabled" | "cached" | "live";
    additionalDirectories?: string[];
    effort?: "low" | "medium" | "high" | "max";
    worktree?: {
        enabled?: boolean;
    };
    mutates_checkout?: boolean;
    tags?: string[];
    requires?: "github"[];
    cost_caps?: {
        per_task?: number;
        per_session?: number;
        per_day?: number;
    };
}>;
export type WorkflowBase = z.infer<typeof workflowBaseSchema>;
/**
 * Workflow definition parsed from YAML.
 * All workflows use DAG-based execution with `nodes`.
 */
export declare const workflowDefinitionSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    provider: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    modelReasoningEffort: z.ZodOptional<z.ZodEnum<["minimal", "low", "medium", "high", "xhigh"]>>;
    webSearchMode: z.ZodOptional<z.ZodEnum<["disabled", "cached", "live"]>>;
    additionalDirectories: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    effort: z.ZodOptional<z.ZodEnum<["low", "medium", "high", "max"]>>;
    worktree: z.ZodOptional<z.ZodObject<{
        /**
         * Pin worktree isolation on or off for this workflow.
         * - `true`  — always run inside a worktree; CLI `--no-worktree` hard-errors
         * - `false` — always run in the live checkout; CLI `--branch` / `--from`
         *             hard-error, orchestrator skips isolation resolution
         * - omitted — caller decides (current default = worktree for most types)
         */
        enabled: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        enabled?: boolean;
    }, {
        enabled?: boolean;
    }>>;
    /**
     * When `false`, the engine skips the path-exclusive lock for this workflow,
     * allowing N concurrent runs on the same live checkout. The author asserts
     * that concurrent runs will not race (e.g. all writes are per-run-scoped).
     * Defaults to `true` (safe: serialize runs on the same path).
     */
    mutates_checkout: z.ZodOptional<z.ZodBoolean>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /**
     * External capabilities this workflow needs. When it includes `github`, the
     * run is hard-blocked at invocation (before any worktree/clone/AI cost) if
     * the originating user has not connected their GitHub identity. Only enforced
     * when per-user GitHub is enabled; a no-op for solo PAT installs.
     */
    requires: z.ZodOptional<z.ZodArray<z.ZodEnum<["github"]>, "many">>;
    /**
     * Chimera-specific per-workflow cost caps. Each field is optional; omit a
     * field to leave that scope uncapped.
     */
    cost_caps: z.ZodOptional<z.ZodObject<{
        per_task: z.ZodOptional<z.ZodNumber>;
        per_session: z.ZodOptional<z.ZodNumber>;
        per_day: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        per_task?: number;
        per_session?: number;
        per_day?: number;
    }, {
        per_task?: number;
        per_session?: number;
        per_day?: number;
    }>>;
} & {
    nodes: z.ZodArray<z.ZodEffects<z.ZodEffects<z.ZodObject<{
        id: z.ZodString;
        depends_on: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        when: z.ZodOptional<z.ZodString>;
        trigger_rule: z.ZodOptional<z.ZodEnum<["all_success", "one_success", "none_failed_min_one_success", "all_done"]>>;
        model: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodString>;
        context: z.ZodOptional<z.ZodEnum<["fresh", "shared"]>>;
        output_format: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        allowed_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        denied_tools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        idle_timeout: z.ZodOptional<z.ZodNumber>;
        retry: z.ZodOptional<z.ZodObject<{
            max_attempts: z.ZodNumber;
            delay_ms: z.ZodOptional<z.ZodNumber>;
            on_error: z.ZodOptional<z.ZodEnum<["transient", "all"]>>;
        }, "strip", z.ZodTypeAny, {
            max_attempts?: number;
            delay_ms?: number;
            on_error?: "transient" | "all";
        }, {
            max_attempts?: number;
            delay_ms?: number;
            on_error?: "transient" | "all";
        }>>;
        cost_cap: z.ZodOptional<z.ZodNumber>;
        always_run: z.ZodOptional<z.ZodBoolean>;
        output_type: z.ZodOptional<z.ZodString>;
    } & {
        command: z.ZodOptional<z.ZodString>;
        prompt: z.ZodOptional<z.ZodString>;
        bash: z.ZodOptional<z.ZodString>;
        loop: z.ZodOptional<z.ZodEffects<z.ZodObject<{
            prompt: z.ZodString;
            until: z.ZodString;
            max_iterations: z.ZodNumber;
            fresh_context: z.ZodDefault<z.ZodBoolean>;
            until_bash: z.ZodOptional<z.ZodString>;
            interactive: z.ZodOptional<z.ZodBoolean>;
            gate_message: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            prompt?: string;
            until?: string;
            max_iterations?: number;
            fresh_context?: boolean;
            until_bash?: string;
            interactive?: boolean;
            gate_message?: string;
        }, {
            prompt?: string;
            until?: string;
            max_iterations?: number;
            fresh_context?: boolean;
            until_bash?: string;
            interactive?: boolean;
            gate_message?: string;
        }>, {
            prompt?: string;
            until?: string;
            max_iterations?: number;
            fresh_context?: boolean;
            until_bash?: string;
            interactive?: boolean;
            gate_message?: string;
        }, {
            prompt?: string;
            until?: string;
            max_iterations?: number;
            fresh_context?: boolean;
            until_bash?: string;
            interactive?: boolean;
            gate_message?: string;
        }>>;
        approval: z.ZodOptional<z.ZodObject<{
            message: z.ZodString;
            capture_response: z.ZodOptional<z.ZodBoolean>;
            on_reject: z.ZodOptional<z.ZodObject<{
                prompt: z.ZodString;
                max_attempts: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                max_attempts?: number;
                prompt?: string;
            }, {
                max_attempts?: number;
                prompt?: string;
            }>>;
        }, "strip", z.ZodTypeAny, {
            message?: string;
            capture_response?: boolean;
            on_reject?: {
                max_attempts?: number;
                prompt?: string;
            };
        }, {
            message?: string;
            capture_response?: boolean;
            on_reject?: {
                max_attempts?: number;
                prompt?: string;
            };
        }>>;
        cancel: z.ZodOptional<z.ZodString>;
        script: z.ZodOptional<z.ZodString>;
        runtime: z.ZodOptional<z.ZodEnum<["bun", "uv"]>>;
        deps: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timeout: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        prompt?: string;
        id?: string;
        depends_on?: string[];
        when?: string;
        trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done";
        model?: string;
        provider?: string;
        context?: "fresh" | "shared";
        output_format?: Record<string, unknown>;
        allowed_tools?: string[];
        denied_tools?: string[];
        idle_timeout?: number;
        retry?: {
            max_attempts?: number;
            delay_ms?: number;
            on_error?: "transient" | "all";
        };
        cost_cap?: number;
        always_run?: boolean;
        output_type?: string;
        command?: string;
        bash?: string;
        timeout?: number;
        script?: string;
        runtime?: "bun" | "uv";
        deps?: string[];
        loop?: {
            prompt?: string;
            until?: string;
            max_iterations?: number;
            fresh_context?: boolean;
            until_bash?: string;
            interactive?: boolean;
            gate_message?: string;
        };
        approval?: {
            message?: string;
            capture_response?: boolean;
            on_reject?: {
                max_attempts?: number;
                prompt?: string;
            };
        };
        cancel?: string;
    }, {
        prompt?: string;
        id?: string;
        depends_on?: string[];
        when?: string;
        trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done";
        model?: string;
        provider?: string;
        context?: "fresh" | "shared";
        output_format?: Record<string, unknown>;
        allowed_tools?: string[];
        denied_tools?: string[];
        idle_timeout?: number;
        retry?: {
            max_attempts?: number;
            delay_ms?: number;
            on_error?: "transient" | "all";
        };
        cost_cap?: number;
        always_run?: boolean;
        output_type?: string;
        command?: string;
        bash?: string;
        timeout?: number;
        script?: string;
        runtime?: "bun" | "uv";
        deps?: string[];
        loop?: {
            prompt?: string;
            until?: string;
            max_iterations?: number;
            fresh_context?: boolean;
            until_bash?: string;
            interactive?: boolean;
            gate_message?: string;
        };
        approval?: {
            message?: string;
            capture_response?: boolean;
            on_reject?: {
                max_attempts?: number;
                prompt?: string;
            };
        };
        cancel?: string;
    }>, {
        prompt?: string;
        id?: string;
        depends_on?: string[];
        when?: string;
        trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done";
        model?: string;
        provider?: string;
        context?: "fresh" | "shared";
        output_format?: Record<string, unknown>;
        allowed_tools?: string[];
        denied_tools?: string[];
        idle_timeout?: number;
        retry?: {
            max_attempts?: number;
            delay_ms?: number;
            on_error?: "transient" | "all";
        };
        cost_cap?: number;
        always_run?: boolean;
        output_type?: string;
        command?: string;
        bash?: string;
        timeout?: number;
        script?: string;
        runtime?: "bun" | "uv";
        deps?: string[];
        loop?: {
            prompt?: string;
            until?: string;
            max_iterations?: number;
            fresh_context?: boolean;
            until_bash?: string;
            interactive?: boolean;
            gate_message?: string;
        };
        approval?: {
            message?: string;
            capture_response?: boolean;
            on_reject?: {
                max_attempts?: number;
                prompt?: string;
            };
        };
        cancel?: string;
    }, {
        prompt?: string;
        id?: string;
        depends_on?: string[];
        when?: string;
        trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done";
        model?: string;
        provider?: string;
        context?: "fresh" | "shared";
        output_format?: Record<string, unknown>;
        allowed_tools?: string[];
        denied_tools?: string[];
        idle_timeout?: number;
        retry?: {
            max_attempts?: number;
            delay_ms?: number;
            on_error?: "transient" | "all";
        };
        cost_cap?: number;
        always_run?: boolean;
        output_type?: string;
        command?: string;
        bash?: string;
        timeout?: number;
        script?: string;
        runtime?: "bun" | "uv";
        deps?: string[];
        loop?: {
            prompt?: string;
            until?: string;
            max_iterations?: number;
            fresh_context?: boolean;
            until_bash?: string;
            interactive?: boolean;
            gate_message?: string;
        };
        approval?: {
            message?: string;
            capture_response?: boolean;
            on_reject?: {
                max_attempts?: number;
                prompt?: string;
            };
        };
        cancel?: string;
    }>, import("./dag-node.js").CommandNode | import("./dag-node.js").PromptNode | import("./dag-node.js").BashNode | import("./dag-node.js").ScriptNode | import("./dag-node.js").LoopNode | import("./dag-node.js").ApprovalNode | import("./dag-node.js").CancelNode, {
        prompt?: string;
        id?: string;
        depends_on?: string[];
        when?: string;
        trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done";
        model?: string;
        provider?: string;
        context?: "fresh" | "shared";
        output_format?: Record<string, unknown>;
        allowed_tools?: string[];
        denied_tools?: string[];
        idle_timeout?: number;
        retry?: {
            max_attempts?: number;
            delay_ms?: number;
            on_error?: "transient" | "all";
        };
        cost_cap?: number;
        always_run?: boolean;
        output_type?: string;
        command?: string;
        bash?: string;
        timeout?: number;
        script?: string;
        runtime?: "bun" | "uv";
        deps?: string[];
        loop?: {
            prompt?: string;
            until?: string;
            max_iterations?: number;
            fresh_context?: boolean;
            until_bash?: string;
            interactive?: boolean;
            gate_message?: string;
        };
        approval?: {
            message?: string;
            capture_response?: boolean;
            on_reject?: {
                max_attempts?: number;
                prompt?: string;
            };
        };
        cancel?: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    nodes?: (import("./dag-node.js").CommandNode | import("./dag-node.js").PromptNode | import("./dag-node.js").BashNode | import("./dag-node.js").ScriptNode | import("./dag-node.js").LoopNode | import("./dag-node.js").ApprovalNode | import("./dag-node.js").CancelNode)[];
    model?: string;
    provider?: string;
    name?: string;
    description?: string;
    modelReasoningEffort?: "low" | "medium" | "high" | "minimal" | "xhigh";
    webSearchMode?: "disabled" | "cached" | "live";
    additionalDirectories?: string[];
    effort?: "low" | "medium" | "high" | "max";
    worktree?: {
        enabled?: boolean;
    };
    mutates_checkout?: boolean;
    tags?: string[];
    requires?: "github"[];
    cost_caps?: {
        per_task?: number;
        per_session?: number;
        per_day?: number;
    };
}, {
    nodes?: {
        prompt?: string;
        id?: string;
        depends_on?: string[];
        when?: string;
        trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done";
        model?: string;
        provider?: string;
        context?: "fresh" | "shared";
        output_format?: Record<string, unknown>;
        allowed_tools?: string[];
        denied_tools?: string[];
        idle_timeout?: number;
        retry?: {
            max_attempts?: number;
            delay_ms?: number;
            on_error?: "transient" | "all";
        };
        cost_cap?: number;
        always_run?: boolean;
        output_type?: string;
        command?: string;
        bash?: string;
        timeout?: number;
        script?: string;
        runtime?: "bun" | "uv";
        deps?: string[];
        loop?: {
            prompt?: string;
            until?: string;
            max_iterations?: number;
            fresh_context?: boolean;
            until_bash?: string;
            interactive?: boolean;
            gate_message?: string;
        };
        approval?: {
            message?: string;
            capture_response?: boolean;
            on_reject?: {
                max_attempts?: number;
                prompt?: string;
            };
        };
        cancel?: string;
    }[];
    model?: string;
    provider?: string;
    name?: string;
    description?: string;
    modelReasoningEffort?: "low" | "medium" | "high" | "minimal" | "xhigh";
    webSearchMode?: "disabled" | "cached" | "live";
    additionalDirectories?: string[];
    effort?: "low" | "medium" | "high" | "max";
    worktree?: {
        enabled?: boolean;
    };
    mutates_checkout?: boolean;
    tags?: string[];
    requires?: "github"[];
    cost_caps?: {
        per_task?: number;
        per_session?: number;
        per_day?: number;
    };
}>;
/** Workflow definition with fully typed nodes (DagNode[]) derived from the schema. */
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema> & {
    prompt?: never;
};
/**
 * Result of loading a command prompt - discriminated union for specific error handling
 *
 * On success, `content` is non-empty (enforced at load time, not by the type).
 */
export type LoadCommandResult = {
    success: true;
    content: string;
} | {
    success: false;
    reason: 'invalid_name' | 'empty_file' | 'not_found' | 'permission_denied' | 'read_error';
    message: string;
};
/**
 * Result of workflow execution - allows callers to detect success/failure
 */
export type WorkflowExecutionResult = {
    success: true;
    workflowRunId: string;
    summary?: string;
} | {
    success: false;
    workflowRunId?: string;
    error: string;
} | {
    success: true;
    paused: true;
    workflowRunId: string;
};
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
//# sourceMappingURL=workflow.d.ts.map