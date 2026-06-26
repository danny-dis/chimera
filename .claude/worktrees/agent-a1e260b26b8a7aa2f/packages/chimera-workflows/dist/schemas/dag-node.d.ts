/**
 * Zod schemas for DAG node types.
 *
 * Design: a flat "raw" schema validates all fields (with mutual exclusivity enforced via
 * superRefine), then a transform produces one of the seven concrete variant types
 * (CommandNode, PromptNode, BashNode, LoopNode, ApprovalNode, CancelNode, ScriptNode)
 * as the DagNode union. Per-variant schemas (commandNodeSchema etc.) are exported for
 * type derivation only — use dagNodeSchema for validation.
 *
 * z.union() is NOT used here — YAML nodes lack an explicit `type` discriminant,
 * so a flat schema with superRefine is cleaner than a z.union() with implicit discriminants.
 *
 * Ported from research/archon/packages/workflows/src/schemas/dag-node.ts @ 2026-06-15.
 *
 * Slimmed for chimera: dropped Claude SDK-specific fields (hooks, mcp, agents,
 * skills, effort, thinking, maxBudgetUsd, systemPrompt, fallbackModel, betas,
 * sandbox, persist_session) — chimera is provider-neutral. Added
 * `cost_cap: z.number().positive().optional()` as a chimera-specific per-node
 * budget. The full Claude SDK surface lives in @chimera/providers when we
 * wire Claude in.
 */
import { z } from 'zod';
export declare const triggerRuleSchema: z.ZodEnum<["all_success", "one_success", "none_failed_min_one_success", "all_done"]>;
export type TriggerRule = z.infer<typeof triggerRuleSchema>;
/** Canonical list of trigger rules — derived from schema, do not duplicate. */
export declare const TRIGGER_RULES: readonly TriggerRule[];
/**
 * Reasoning-effort level — provider-neutral enum. Provider-specific reasoning
 * knobs (e.g. Codex modelReasoningEffort) live in the provider layer, not here.
 * Kept narrow on purpose: only what chimera needs today.
 */
export declare const effortLevelSchema: z.ZodEnum<["low", "medium", "high", "max"]>;
export type EffortLevel = z.infer<typeof effortLevelSchema>;
export declare const dagNodeBaseSchema: z.ZodObject<{
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
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }, {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }>>;
    /**
     * Chimera-specific per-node cost cap (USD). Distinct from the per-workflow
     * `cost_caps` in workflow.ts — this pins a single node's budget.
     */
    cost_cap: z.ZodOptional<z.ZodNumber>;
    /**
     * Opt out of resume caching: when true, this node re-runs on resume even if a
     * prior run completed it successfully. Use for producers whose exit code does
     * not capture output validity (e.g. bash that writes a file the consumer parses).
     */
    always_run: z.ZodOptional<z.ZodBoolean>;
    /**
     * Declares the semantic type of this node's output (e.g. 'plan', 'findings',
     * 'code', 'summary' — an open set). When set, the executor writes a typed
     * sidecar artifact (`nodes/<id>.md` + `<id>.meta.json`) after the node
     * completes, so other nodes and later runs can locate output by type instead
     * of guessing filenames. Valid on every node type (bash/script produce typed
     * outputs too) — not an AI-only field.
     */
    output_type: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
}, {
    id: string;
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
}>;
export type DagNodeBase = z.infer<typeof dagNodeBaseSchema>;
export declare const commandNodeSchema: z.ZodObject<{
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
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }, {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }>>;
    /**
     * Chimera-specific per-node cost cap (USD). Distinct from the per-workflow
     * `cost_caps` in workflow.ts — this pins a single node's budget.
     */
    cost_cap: z.ZodOptional<z.ZodNumber>;
    /**
     * Opt out of resume caching: when true, this node re-runs on resume even if a
     * prior run completed it successfully. Use for producers whose exit code does
     * not capture output validity (e.g. bash that writes a file the consumer parses).
     */
    always_run: z.ZodOptional<z.ZodBoolean>;
    /**
     * Declares the semantic type of this node's output (e.g. 'plan', 'findings',
     * 'code', 'summary' — an open set). When set, the executor writes a typed
     * sidecar artifact (`nodes/<id>.md` + `<id>.meta.json`) after the node
     * completes, so other nodes and later runs can locate output by type instead
     * of guessing filenames. Valid on every node type (bash/script produce typed
     * outputs too) — not an AI-only field.
     */
    output_type: z.ZodOptional<z.ZodString>;
} & {
    command: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    command: string;
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
}, {
    id: string;
    command: string;
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
}>;
/** DAG node that runs a named command from .chimera/commands/ */
export type CommandNode = z.infer<typeof commandNodeSchema> & {
    prompt?: never;
    bash?: never;
    loop?: never;
    approval?: never;
    cancel?: never;
    script?: never;
};
export declare const promptNodeSchema: z.ZodObject<{
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
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }, {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }>>;
    /**
     * Chimera-specific per-node cost cap (USD). Distinct from the per-workflow
     * `cost_caps` in workflow.ts — this pins a single node's budget.
     */
    cost_cap: z.ZodOptional<z.ZodNumber>;
    /**
     * Opt out of resume caching: when true, this node re-runs on resume even if a
     * prior run completed it successfully. Use for producers whose exit code does
     * not capture output validity (e.g. bash that writes a file the consumer parses).
     */
    always_run: z.ZodOptional<z.ZodBoolean>;
    /**
     * Declares the semantic type of this node's output (e.g. 'plan', 'findings',
     * 'code', 'summary' — an open set). When set, the executor writes a typed
     * sidecar artifact (`nodes/<id>.md` + `<id>.meta.json`) after the node
     * completes, so other nodes and later runs can locate output by type instead
     * of guessing filenames. Valid on every node type (bash/script produce typed
     * outputs too) — not an AI-only field.
     */
    output_type: z.ZodOptional<z.ZodString>;
} & {
    prompt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    prompt: string;
    id: string;
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
}, {
    prompt: string;
    id: string;
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
}>;
/** DAG node with an inline prompt (no command file) */
export type PromptNode = z.infer<typeof promptNodeSchema> & {
    command?: never;
    bash?: never;
    loop?: never;
    approval?: never;
    cancel?: never;
    script?: never;
};
/**
 * Bash node schema — extends base with `bash` (shell script) and `timeout` (ms).
 * AI-specific fields from the base are present in the type but ignored at runtime with a warning.
 */
export declare const bashNodeSchema: z.ZodObject<{
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
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }, {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }>>;
    /**
     * Chimera-specific per-node cost cap (USD). Distinct from the per-workflow
     * `cost_caps` in workflow.ts — this pins a single node's budget.
     */
    cost_cap: z.ZodOptional<z.ZodNumber>;
    /**
     * Opt out of resume caching: when true, this node re-runs on resume even if a
     * prior run completed it successfully. Use for producers whose exit code does
     * not capture output validity (e.g. bash that writes a file the consumer parses).
     */
    always_run: z.ZodOptional<z.ZodBoolean>;
    /**
     * Declares the semantic type of this node's output (e.g. 'plan', 'findings',
     * 'code', 'summary' — an open set). When set, the executor writes a typed
     * sidecar artifact (`nodes/<id>.md` + `<id>.meta.json`) after the node
     * completes, so other nodes and later runs can locate output by type instead
     * of guessing filenames. Valid on every node type (bash/script produce typed
     * outputs too) — not an AI-only field.
     */
    output_type: z.ZodOptional<z.ZodString>;
} & {
    bash: z.ZodString;
    timeout: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    bash: string;
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
    timeout?: number | undefined;
}, {
    id: string;
    bash: string;
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
    timeout?: number | undefined;
}>;
/** DAG node that runs a shell script without AI */
export type BashNode = z.infer<typeof bashNodeSchema> & {
    command?: never;
    prompt?: never;
    loop?: never;
    approval?: never;
    cancel?: never;
    script?: never;
};
/**
 * Script node schema — extends base with `script` (inline code or named script),
 * `runtime` ('bun' or 'uv'), `deps` (dependency list), and `timeout` (ms).
 * AI-specific fields from the base are present in the type but ignored at runtime with a warning.
 */
export declare const scriptNodeSchema: z.ZodObject<{
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
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }, {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }>>;
    /**
     * Chimera-specific per-node cost cap (USD). Distinct from the per-workflow
     * `cost_caps` in workflow.ts — this pins a single node's budget.
     */
    cost_cap: z.ZodOptional<z.ZodNumber>;
    /**
     * Opt out of resume caching: when true, this node re-runs on resume even if a
     * prior run completed it successfully. Use for producers whose exit code does
     * not capture output validity (e.g. bash that writes a file the consumer parses).
     */
    always_run: z.ZodOptional<z.ZodBoolean>;
    /**
     * Declares the semantic type of this node's output (e.g. 'plan', 'findings',
     * 'code', 'summary' — an open set). When set, the executor writes a typed
     * sidecar artifact (`nodes/<id>.md` + `<id>.meta.json`) after the node
     * completes, so other nodes and later runs can locate output by type instead
     * of guessing filenames. Valid on every node type (bash/script produce typed
     * outputs too) — not an AI-only field.
     */
    output_type: z.ZodOptional<z.ZodString>;
} & {
    script: z.ZodString;
    runtime: z.ZodEnum<["bun", "uv"]>;
    deps: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    timeout: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    script: string;
    runtime: "bun" | "uv";
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
    timeout?: number | undefined;
    deps?: string[] | undefined;
}, {
    id: string;
    script: string;
    runtime: "bun" | "uv";
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
    timeout?: number | undefined;
    deps?: string[] | undefined;
}>;
/** DAG node that runs a TypeScript or Python script via bun or uv */
export type ScriptNode = z.infer<typeof scriptNodeSchema> & {
    command?: never;
    prompt?: never;
    bash?: never;
    loop?: never;
    approval?: never;
    cancel?: never;
};
/**
 * Loop node schema — extends base with `loop` config.
 * AI-specific fields from the base are present in the type but ignored at runtime with a warning.
 * retry is not supported on loop nodes (enforced at parse time).
 */
export declare const loopNodeSchema: z.ZodObject<{
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
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }, {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }>>;
    /**
     * Chimera-specific per-node cost cap (USD). Distinct from the per-workflow
     * `cost_caps` in workflow.ts — this pins a single node's budget.
     */
    cost_cap: z.ZodOptional<z.ZodNumber>;
    /**
     * Opt out of resume caching: when true, this node re-runs on resume even if a
     * prior run completed it successfully. Use for producers whose exit code does
     * not capture output validity (e.g. bash that writes a file the consumer parses).
     */
    always_run: z.ZodOptional<z.ZodBoolean>;
    /**
     * Declares the semantic type of this node's output (e.g. 'plan', 'findings',
     * 'code', 'summary' — an open set). When set, the executor writes a typed
     * sidecar artifact (`nodes/<id>.md` + `<id>.meta.json`) after the node
     * completes, so other nodes and later runs can locate output by type instead
     * of guessing filenames. Valid on every node type (bash/script produce typed
     * outputs too) — not an AI-only field.
     */
    output_type: z.ZodOptional<z.ZodString>;
} & {
    loop: z.ZodEffects<z.ZodObject<{
        prompt: z.ZodString;
        until: z.ZodString;
        max_iterations: z.ZodNumber;
        fresh_context: z.ZodDefault<z.ZodBoolean>;
        until_bash: z.ZodOptional<z.ZodString>;
        interactive: z.ZodOptional<z.ZodBoolean>;
        gate_message: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        prompt: string;
        until: string;
        max_iterations: number;
        fresh_context: boolean;
        until_bash?: string | undefined;
        interactive?: boolean | undefined;
        gate_message?: string | undefined;
    }, {
        prompt: string;
        until: string;
        max_iterations: number;
        fresh_context?: boolean | undefined;
        until_bash?: string | undefined;
        interactive?: boolean | undefined;
        gate_message?: string | undefined;
    }>, {
        prompt: string;
        until: string;
        max_iterations: number;
        fresh_context: boolean;
        until_bash?: string | undefined;
        interactive?: boolean | undefined;
        gate_message?: string | undefined;
    }, {
        prompt: string;
        until: string;
        max_iterations: number;
        fresh_context?: boolean | undefined;
        until_bash?: string | undefined;
        interactive?: boolean | undefined;
        gate_message?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    loop: {
        prompt: string;
        until: string;
        max_iterations: number;
        fresh_context: boolean;
        until_bash?: string | undefined;
        interactive?: boolean | undefined;
        gate_message?: string | undefined;
    };
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
}, {
    id: string;
    loop: {
        prompt: string;
        until: string;
        max_iterations: number;
        fresh_context?: boolean | undefined;
        until_bash?: string | undefined;
        interactive?: boolean | undefined;
        gate_message?: string | undefined;
    };
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
}>;
/** DAG node that runs an AI prompt in a loop until a completion condition is met */
export type LoopNode = z.infer<typeof loopNodeSchema> & {
    command?: never;
    prompt?: never;
    bash?: never;
    approval?: never;
    cancel?: never;
    script?: never;
};
/** Schema for the `on_reject` sub-object on approval nodes. */
export declare const approvalOnRejectSchema: z.ZodObject<{
    prompt: z.ZodString;
    max_attempts: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    prompt: string;
    max_attempts?: number | undefined;
}, {
    prompt: string;
    max_attempts?: number | undefined;
}>;
export type ApprovalOnReject = z.infer<typeof approvalOnRejectSchema>;
/**
 * Approval node schema — pauses the workflow for human review.
 * Extends full base for type compatibility; AI-specific fields are ignored at runtime.
 */
export declare const approvalNodeSchema: z.ZodObject<{
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
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }, {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }>>;
    /**
     * Chimera-specific per-node cost cap (USD). Distinct from the per-workflow
     * `cost_caps` in workflow.ts — this pins a single node's budget.
     */
    cost_cap: z.ZodOptional<z.ZodNumber>;
    /**
     * Opt out of resume caching: when true, this node re-runs on resume even if a
     * prior run completed it successfully. Use for producers whose exit code does
     * not capture output validity (e.g. bash that writes a file the consumer parses).
     */
    always_run: z.ZodOptional<z.ZodBoolean>;
    /**
     * Declares the semantic type of this node's output (e.g. 'plan', 'findings',
     * 'code', 'summary' — an open set). When set, the executor writes a typed
     * sidecar artifact (`nodes/<id>.md` + `<id>.meta.json`) after the node
     * completes, so other nodes and later runs can locate output by type instead
     * of guessing filenames. Valid on every node type (bash/script produce typed
     * outputs too) — not an AI-only field.
     */
    output_type: z.ZodOptional<z.ZodString>;
} & {
    approval: z.ZodObject<{
        message: z.ZodString;
        capture_response: z.ZodOptional<z.ZodBoolean>;
        on_reject: z.ZodOptional<z.ZodObject<{
            prompt: z.ZodString;
            max_attempts: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            prompt: string;
            max_attempts?: number | undefined;
        }, {
            prompt: string;
            max_attempts?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        capture_response?: boolean | undefined;
        on_reject?: {
            prompt: string;
            max_attempts?: number | undefined;
        } | undefined;
    }, {
        message: string;
        capture_response?: boolean | undefined;
        on_reject?: {
            prompt: string;
            max_attempts?: number | undefined;
        } | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    approval: {
        message: string;
        capture_response?: boolean | undefined;
        on_reject?: {
            prompt: string;
            max_attempts?: number | undefined;
        } | undefined;
    };
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
}, {
    id: string;
    approval: {
        message: string;
        capture_response?: boolean | undefined;
        on_reject?: {
            prompt: string;
            max_attempts?: number | undefined;
        } | undefined;
    };
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
}>;
/** DAG node that pauses workflow execution for human approval */
export type ApprovalNode = z.infer<typeof approvalNodeSchema> & {
    command?: never;
    prompt?: never;
    bash?: never;
    loop?: never;
    cancel?: never;
    script?: never;
};
/**
 * Cancel node schema — terminates the workflow run with a reason string.
 * Extends full base for type compatibility; AI-specific fields are ignored at runtime.
 */
export declare const cancelNodeSchema: z.ZodObject<{
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
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }, {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }>>;
    /**
     * Chimera-specific per-node cost cap (USD). Distinct from the per-workflow
     * `cost_caps` in workflow.ts — this pins a single node's budget.
     */
    cost_cap: z.ZodOptional<z.ZodNumber>;
    /**
     * Opt out of resume caching: when true, this node re-runs on resume even if a
     * prior run completed it successfully. Use for producers whose exit code does
     * not capture output validity (e.g. bash that writes a file the consumer parses).
     */
    always_run: z.ZodOptional<z.ZodBoolean>;
    /**
     * Declares the semantic type of this node's output (e.g. 'plan', 'findings',
     * 'code', 'summary' — an open set). When set, the executor writes a typed
     * sidecar artifact (`nodes/<id>.md` + `<id>.meta.json`) after the node
     * completes, so other nodes and later runs can locate output by type instead
     * of guessing filenames. Valid on every node type (bash/script produce typed
     * outputs too) — not an AI-only field.
     */
    output_type: z.ZodOptional<z.ZodString>;
} & {
    cancel: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    cancel: string;
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
}, {
    id: string;
    cancel: string;
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
}>;
/** DAG node that cancels the workflow run with a reason string */
export type CancelNode = z.infer<typeof cancelNodeSchema> & {
    command?: never;
    prompt?: never;
    bash?: never;
    loop?: never;
    approval?: never;
    script?: never;
};
/** A single node in a DAG workflow. command, prompt, bash, loop, approval, cancel, and script are mutually exclusive. */
export type DagNode = CommandNode | PromptNode | BashNode | LoopNode | ApprovalNode | CancelNode | ScriptNode;
/**
 * AI-specific fields that are meaningless on bash nodes — exported for loader warnings.
 * Slimmed for chimera: dropped Claude-only fields (hooks, mcp, skills, agents,
 * effort, thinking, maxBudgetUsd, systemPrompt, fallbackModel, betas, sandbox,
 * persist_session) — none of those live on the chimera base schema.
 */
export declare const BASH_NODE_AI_FIELDS: readonly string[];
/** AI-specific fields that are meaningless on script nodes — same as bash nodes */
export declare const SCRIPT_NODE_AI_FIELDS: readonly string[];
/**
 * AI-specific fields that are unsupported on loop nodes.
 * `model` and `provider` are excluded because the DAG executor resolves and
 * forwards them to each iteration's AI call.
 */
export declare const LOOP_NODE_AI_FIELDS: readonly string[];
/**
 * Validates a raw YAML object as a DAG node and transforms it to a typed DagNode.
 *
 * Enforces:
 * - Non-empty id
 * - Exactly one of command/prompt/bash/loop/approval/cancel/script (mutual exclusivity)
 * - command name validity (via isValidCommandName)
 * - idle_timeout must be a finite positive number
 * - retry not allowed on loop nodes
 * - timeout on bash must be positive
 *
 * Note: provider identity is validated in loader.ts (workflow-level) and
 * the executor (node-level). Model strings are passed through to the SDK
 * unchanged — the SDK is the source of truth for what model names exist.
 */
export declare const dagNodeSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
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
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }, {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    }>>;
    /**
     * Chimera-specific per-node cost cap (USD). Distinct from the per-workflow
     * `cost_caps` in workflow.ts — this pins a single node's budget.
     */
    cost_cap: z.ZodOptional<z.ZodNumber>;
    /**
     * Opt out of resume caching: when true, this node re-runs on resume even if a
     * prior run completed it successfully. Use for producers whose exit code does
     * not capture output validity (e.g. bash that writes a file the consumer parses).
     */
    always_run: z.ZodOptional<z.ZodBoolean>;
    /**
     * Declares the semantic type of this node's output (e.g. 'plan', 'findings',
     * 'code', 'summary' — an open set). When set, the executor writes a typed
     * sidecar artifact (`nodes/<id>.md` + `<id>.meta.json`) after the node
     * completes, so other nodes and later runs can locate output by type instead
     * of guessing filenames. Valid on every node type (bash/script produce typed
     * outputs too) — not an AI-only field.
     */
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
        prompt: string;
        until: string;
        max_iterations: number;
        fresh_context: boolean;
        until_bash?: string | undefined;
        interactive?: boolean | undefined;
        gate_message?: string | undefined;
    }, {
        prompt: string;
        until: string;
        max_iterations: number;
        fresh_context?: boolean | undefined;
        until_bash?: string | undefined;
        interactive?: boolean | undefined;
        gate_message?: string | undefined;
    }>, {
        prompt: string;
        until: string;
        max_iterations: number;
        fresh_context: boolean;
        until_bash?: string | undefined;
        interactive?: boolean | undefined;
        gate_message?: string | undefined;
    }, {
        prompt: string;
        until: string;
        max_iterations: number;
        fresh_context?: boolean | undefined;
        until_bash?: string | undefined;
        interactive?: boolean | undefined;
        gate_message?: string | undefined;
    }>>;
    approval: z.ZodOptional<z.ZodObject<{
        message: z.ZodString;
        capture_response: z.ZodOptional<z.ZodBoolean>;
        on_reject: z.ZodOptional<z.ZodObject<{
            prompt: z.ZodString;
            max_attempts: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            prompt: string;
            max_attempts?: number | undefined;
        }, {
            prompt: string;
            max_attempts?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        capture_response?: boolean | undefined;
        on_reject?: {
            prompt: string;
            max_attempts?: number | undefined;
        } | undefined;
    }, {
        message: string;
        capture_response?: boolean | undefined;
        on_reject?: {
            prompt: string;
            max_attempts?: number | undefined;
        } | undefined;
    }>>;
    cancel: z.ZodOptional<z.ZodString>;
    script: z.ZodOptional<z.ZodString>;
    runtime: z.ZodOptional<z.ZodEnum<["bun", "uv"]>>;
    deps: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    timeout: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    prompt?: string | undefined;
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
    command?: string | undefined;
    bash?: string | undefined;
    timeout?: number | undefined;
    script?: string | undefined;
    runtime?: "bun" | "uv" | undefined;
    deps?: string[] | undefined;
    loop?: {
        prompt: string;
        until: string;
        max_iterations: number;
        fresh_context: boolean;
        until_bash?: string | undefined;
        interactive?: boolean | undefined;
        gate_message?: string | undefined;
    } | undefined;
    approval?: {
        message: string;
        capture_response?: boolean | undefined;
        on_reject?: {
            prompt: string;
            max_attempts?: number | undefined;
        } | undefined;
    } | undefined;
    cancel?: string | undefined;
}, {
    id: string;
    prompt?: string | undefined;
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
    command?: string | undefined;
    bash?: string | undefined;
    timeout?: number | undefined;
    script?: string | undefined;
    runtime?: "bun" | "uv" | undefined;
    deps?: string[] | undefined;
    loop?: {
        prompt: string;
        until: string;
        max_iterations: number;
        fresh_context?: boolean | undefined;
        until_bash?: string | undefined;
        interactive?: boolean | undefined;
        gate_message?: string | undefined;
    } | undefined;
    approval?: {
        message: string;
        capture_response?: boolean | undefined;
        on_reject?: {
            prompt: string;
            max_attempts?: number | undefined;
        } | undefined;
    } | undefined;
    cancel?: string | undefined;
}>, {
    id: string;
    prompt?: string | undefined;
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
    command?: string | undefined;
    bash?: string | undefined;
    timeout?: number | undefined;
    script?: string | undefined;
    runtime?: "bun" | "uv" | undefined;
    deps?: string[] | undefined;
    loop?: {
        prompt: string;
        until: string;
        max_iterations: number;
        fresh_context: boolean;
        until_bash?: string | undefined;
        interactive?: boolean | undefined;
        gate_message?: string | undefined;
    } | undefined;
    approval?: {
        message: string;
        capture_response?: boolean | undefined;
        on_reject?: {
            prompt: string;
            max_attempts?: number | undefined;
        } | undefined;
    } | undefined;
    cancel?: string | undefined;
}, {
    id: string;
    prompt?: string | undefined;
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
    command?: string | undefined;
    bash?: string | undefined;
    timeout?: number | undefined;
    script?: string | undefined;
    runtime?: "bun" | "uv" | undefined;
    deps?: string[] | undefined;
    loop?: {
        prompt: string;
        until: string;
        max_iterations: number;
        fresh_context?: boolean | undefined;
        until_bash?: string | undefined;
        interactive?: boolean | undefined;
        gate_message?: string | undefined;
    } | undefined;
    approval?: {
        message: string;
        capture_response?: boolean | undefined;
        on_reject?: {
            prompt: string;
            max_attempts?: number | undefined;
        } | undefined;
    } | undefined;
    cancel?: string | undefined;
}>, CommandNode | PromptNode | BashNode | ScriptNode | LoopNode | ApprovalNode | CancelNode, {
    id: string;
    prompt?: string | undefined;
    depends_on?: string[] | undefined;
    when?: string | undefined;
    trigger_rule?: "all_success" | "one_success" | "none_failed_min_one_success" | "all_done" | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    context?: "fresh" | "shared" | undefined;
    output_format?: Record<string, unknown> | undefined;
    allowed_tools?: string[] | undefined;
    denied_tools?: string[] | undefined;
    idle_timeout?: number | undefined;
    retry?: {
        max_attempts: number;
        delay_ms?: number | undefined;
        on_error?: "transient" | "all" | undefined;
    } | undefined;
    cost_cap?: number | undefined;
    always_run?: boolean | undefined;
    output_type?: string | undefined;
    command?: string | undefined;
    bash?: string | undefined;
    timeout?: number | undefined;
    script?: string | undefined;
    runtime?: "bun" | "uv" | undefined;
    deps?: string[] | undefined;
    loop?: {
        prompt: string;
        until: string;
        max_iterations: number;
        fresh_context?: boolean | undefined;
        until_bash?: string | undefined;
        interactive?: boolean | undefined;
        gate_message?: string | undefined;
    } | undefined;
    approval?: {
        message: string;
        capture_response?: boolean | undefined;
        on_reject?: {
            prompt: string;
            max_attempts?: number | undefined;
        } | undefined;
    } | undefined;
    cancel?: string | undefined;
}>;
/** Type guard: check if a DAG node is a command (named) node */
export declare function isCommandNode(node: DagNode): node is CommandNode;
/** Type guard: check if a DAG node is a prompt (inline) node */
export declare function isPromptNode(node: DagNode): node is PromptNode;
/** Type guard: check if a DAG node is a bash (shell script) node */
export declare function isBashNode(node: DagNode): node is BashNode;
/** Type guard: check if a DAG node is a loop (iterative) node */
export declare function isLoopNode(node: DagNode): node is LoopNode;
/** Type guard: check if a DAG node is an approval (human-in-the-loop) node */
export declare function isApprovalNode(node: DagNode): node is ApprovalNode;
/** Type guard: check if a DAG node is a cancel (workflow termination) node */
export declare function isCancelNode(node: DagNode): node is CancelNode;
/** Type guard: check if a DAG node is a script node */
export declare function isScriptNode(node: DagNode): node is ScriptNode;
/** Type guard: validates a value is a known TriggerRule */
export declare function isTriggerRule(value: unknown): value is TriggerRule;
/**
 * True for node types that invoke a provider and therefore participate in cross-run
 * session persistence. bash, script, approval, cancel, and loop nodes are excluded —
 * they either make no provider call or manage their own per-iteration sessions.
 * Shared by the loader's load-time capability gate and any other caller that needs
 * to reason about persistence eligibility, so the exclusion list lives in one place.
 *
 * Note: chimera has dropped `persist_session` from the base schema for now, so
 * this is purely a "this node makes a provider call" gate, not a persistence
 * resolver. We keep the same name (and shape) for forward compatibility — when
 * we re-introduce persistence per node, the call sites already use this gate.
 */
export declare function isPersistableNode(node: DagNode): boolean;
//# sourceMappingURL=dag-node.d.ts.map