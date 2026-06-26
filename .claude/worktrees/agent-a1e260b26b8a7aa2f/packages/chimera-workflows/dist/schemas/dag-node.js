"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dagNodeSchema = exports.LOOP_NODE_AI_FIELDS = exports.SCRIPT_NODE_AI_FIELDS = exports.BASH_NODE_AI_FIELDS = exports.cancelNodeSchema = exports.approvalNodeSchema = exports.approvalOnRejectSchema = exports.loopNodeSchema = exports.scriptNodeSchema = exports.bashNodeSchema = exports.promptNodeSchema = exports.commandNodeSchema = exports.dagNodeBaseSchema = exports.effortLevelSchema = exports.TRIGGER_RULES = exports.triggerRuleSchema = void 0;
exports.isCommandNode = isCommandNode;
exports.isPromptNode = isPromptNode;
exports.isBashNode = isBashNode;
exports.isLoopNode = isLoopNode;
exports.isApprovalNode = isApprovalNode;
exports.isCancelNode = isCancelNode;
exports.isScriptNode = isScriptNode;
exports.isTriggerRule = isTriggerRule;
exports.isPersistableNode = isPersistableNode;
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
const zod_1 = require("zod");
const retry_js_1 = require("./retry.js");
const loop_js_1 = require("./loop.js");
const command_validation_js_1 = require("../command-validation.js");
// ---------------------------------------------------------------------------
// TriggerRule
// ---------------------------------------------------------------------------
exports.triggerRuleSchema = zod_1.z.enum([
    'all_success',
    'one_success',
    'none_failed_min_one_success',
    'all_done',
]);
/** Canonical list of trigger rules — derived from schema, do not duplicate. */
exports.TRIGGER_RULES = exports.triggerRuleSchema.options;
// ---------------------------------------------------------------------------
// Provider-neutral option schemas
// ---------------------------------------------------------------------------
/**
 * Reasoning-effort level — provider-neutral enum. Provider-specific reasoning
 * knobs (e.g. Codex modelReasoningEffort) live in the provider layer, not here.
 * Kept narrow on purpose: only what chimera needs today.
 */
exports.effortLevelSchema = zod_1.z.enum(['low', 'medium', 'high', 'max']);
// ---------------------------------------------------------------------------
// DagNodeBase — common fields shared by all node types
// ---------------------------------------------------------------------------
exports.dagNodeBaseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    depends_on: zod_1.z.array(zod_1.z.string()).optional(),
    when: zod_1.z.string().optional(),
    trigger_rule: exports.triggerRuleSchema.optional(),
    model: zod_1.z.string().optional(),
    provider: zod_1.z.string().trim().min(1).optional(),
    context: zod_1.z.enum(['fresh', 'shared']).optional(),
    output_format: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    allowed_tools: zod_1.z.array(zod_1.z.string()).optional(),
    denied_tools: zod_1.z.array(zod_1.z.string()).optional(),
    idle_timeout: zod_1.z.number().optional(),
    retry: retry_js_1.stepRetryConfigSchema.optional(),
    /**
     * Chimera-specific per-node cost cap (USD). Distinct from the per-workflow
     * `cost_caps` in workflow.ts — this pins a single node's budget.
     */
    cost_cap: zod_1.z.number().positive().optional(),
    /**
     * Opt out of resume caching: when true, this node re-runs on resume even if a
     * prior run completed it successfully. Use for producers whose exit code does
     * not capture output validity (e.g. bash that writes a file the consumer parses).
     */
    always_run: zod_1.z.boolean().optional(),
    /**
     * Declares the semantic type of this node's output (e.g. 'plan', 'findings',
     * 'code', 'summary' — an open set). When set, the executor writes a typed
     * sidecar artifact (`nodes/<id>.md` + `<id>.meta.json`) after the node
     * completes, so other nodes and later runs can locate output by type instead
     * of guessing filenames. Valid on every node type (bash/script produce typed
     * outputs too) — not an AI-only field.
     */
    output_type: zod_1.z.string().min(1).optional(),
});
// ---------------------------------------------------------------------------
// Per-variant schemas — exported for type derivation only (use dagNodeSchema for validation)
// ---------------------------------------------------------------------------
exports.commandNodeSchema = exports.dagNodeBaseSchema.extend({
    command: zod_1.z.string(),
});
exports.promptNodeSchema = exports.dagNodeBaseSchema.extend({
    prompt: zod_1.z.string(),
});
/**
 * Bash node schema — extends base with `bash` (shell script) and `timeout` (ms).
 * AI-specific fields from the base are present in the type but ignored at runtime with a warning.
 */
exports.bashNodeSchema = exports.dagNodeBaseSchema.extend({
    bash: zod_1.z.string(),
    timeout: zod_1.z.number().optional(),
});
/**
 * Script node schema — extends base with `script` (inline code or named script),
 * `runtime` ('bun' or 'uv'), `deps` (dependency list), and `timeout` (ms).
 * AI-specific fields from the base are present in the type but ignored at runtime with a warning.
 */
exports.scriptNodeSchema = exports.dagNodeBaseSchema.extend({
    script: zod_1.z.string().min(1, 'script cannot be empty'),
    runtime: zod_1.z.enum(['bun', 'uv']),
    deps: zod_1.z.array(zod_1.z.string().min(1, 'each dep must be a non-empty string')).optional(),
    timeout: zod_1.z.number().optional(),
});
/**
 * Loop node schema — extends base with `loop` config.
 * AI-specific fields from the base are present in the type but ignored at runtime with a warning.
 * retry is not supported on loop nodes (enforced at parse time).
 */
exports.loopNodeSchema = exports.dagNodeBaseSchema.extend({
    loop: loop_js_1.loopNodeConfigSchema,
});
/** Schema for the `on_reject` sub-object on approval nodes. */
exports.approvalOnRejectSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1, "'on_reject.prompt' must be a non-empty string"),
    max_attempts: zod_1.z.number().int().min(1).max(10).optional(),
});
/**
 * Approval node schema — pauses the workflow for human review.
 * Extends full base for type compatibility; AI-specific fields are ignored at runtime.
 */
exports.approvalNodeSchema = exports.dagNodeBaseSchema.extend({
    approval: zod_1.z.object({
        message: zod_1.z.string().min(1, "'approval.message' must not be empty"),
        capture_response: zod_1.z.boolean().optional(),
        on_reject: exports.approvalOnRejectSchema.optional(),
    }),
});
/**
 * Cancel node schema — terminates the workflow run with a reason string.
 * Extends full base for type compatibility; AI-specific fields are ignored at runtime.
 */
exports.cancelNodeSchema = exports.dagNodeBaseSchema.extend({
    cancel: zod_1.z.string().min(1, "'cancel' reason must not be empty"),
});
// ---------------------------------------------------------------------------
// AI-specific fields that are meaningless on non-AI nodes
// ---------------------------------------------------------------------------
/**
 * AI-specific fields that are meaningless on bash nodes — exported for loader warnings.
 * Slimmed for chimera: dropped Claude-only fields (hooks, mcp, skills, agents,
 * effort, thinking, maxBudgetUsd, systemPrompt, fallbackModel, betas, sandbox,
 * persist_session) — none of those live on the chimera base schema.
 */
exports.BASH_NODE_AI_FIELDS = [
    'provider',
    'model',
    'context',
    'output_format',
    'allowed_tools',
    'denied_tools',
    'cost_cap',
];
/** AI-specific fields that are meaningless on script nodes — same as bash nodes */
exports.SCRIPT_NODE_AI_FIELDS = exports.BASH_NODE_AI_FIELDS;
/**
 * AI-specific fields that are unsupported on loop nodes.
 * `model` and `provider` are excluded because the DAG executor resolves and
 * forwards them to each iteration's AI call.
 */
exports.LOOP_NODE_AI_FIELDS = exports.BASH_NODE_AI_FIELDS.filter(f => f !== 'model' && f !== 'provider');
// ---------------------------------------------------------------------------
// dagNodeSchema — flat validation schema with transform to DagNode
// ---------------------------------------------------------------------------
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
exports.dagNodeSchema = exports.dagNodeBaseSchema
    .extend({
    // Mode fields (exactly one required)
    command: zod_1.z.string().optional(),
    prompt: zod_1.z.string().optional(),
    bash: zod_1.z.string().optional(),
    loop: loop_js_1.loopNodeConfigSchema.optional(),
    approval: zod_1.z
        .object({
        message: zod_1.z.string().min(1, "'approval.message' must not be empty"),
        capture_response: zod_1.z.boolean().optional(),
        on_reject: exports.approvalOnRejectSchema.optional(),
    })
        .optional(),
    cancel: zod_1.z.string().optional(),
    // Script-only
    script: zod_1.z.string().optional(),
    runtime: zod_1.z.enum(['bun', 'uv']).optional(),
    deps: zod_1.z.array(zod_1.z.string().min(1, 'each dep must be a non-empty string')).optional(),
    // Bash/Script shared
    timeout: zod_1.z.number().optional(),
})
    .superRefine((data, ctx) => {
    const id = data.id.trim();
    // id must be non-empty
    if (!id) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "missing required field 'id'",
            path: ['id'],
        });
        return zod_1.z.NEVER;
    }
    const hasCommand = typeof data.command === 'string' && data.command.trim().length > 0;
    const hasPrompt = typeof data.prompt === 'string' && data.prompt.trim().length > 0;
    const hasBash = typeof data.bash === 'string' && data.bash.trim().length > 0;
    const hasLoop = data.loop !== undefined;
    const hasApproval = data.approval !== undefined;
    const hasCancel = typeof data.cancel === 'string' && data.cancel.trim().length > 0;
    const hasScript = typeof data.script === 'string' && data.script.trim().length > 0;
    const modeCount = [
        hasCommand,
        hasPrompt,
        hasBash,
        hasLoop,
        hasApproval,
        hasCancel,
        hasScript,
    ].filter(Boolean).length;
    if (modeCount > 1) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "'command', 'prompt', 'bash', 'loop', 'approval', 'cancel', and 'script' are mutually exclusive",
        });
        return zod_1.z.NEVER;
    }
    if (modeCount === 0) {
        if (typeof data.bash === 'string') {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'bash script cannot be empty',
                path: ['bash'],
            });
            return zod_1.z.NEVER;
        }
        if (typeof data.prompt === 'string') {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'prompt cannot be empty',
                path: ['prompt'],
            });
            return zod_1.z.NEVER;
        }
        if (typeof data.script === 'string') {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'script cannot be empty',
                path: ['script'],
            });
            return zod_1.z.NEVER;
        }
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "must have either 'command', 'prompt', 'bash', 'loop', 'approval', 'cancel', or 'script'",
        });
        return zod_1.z.NEVER;
    }
    // Command name validation
    if (hasCommand && !(0, command_validation_js_1.isValidCommandName)((data.command ?? '').trim())) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: `invalid command name "${(data.command ?? '').trim()}"`,
            path: ['command'],
        });
    }
    // Bash node validations
    if (hasBash) {
        if (data.timeout !== undefined && (data.timeout <= 0 || !isFinite(data.timeout))) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: "'timeout' must be a positive number (ms)",
                path: ['timeout'],
            });
        }
    }
    // Script node validations
    if (hasScript) {
        if (data.runtime === undefined) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: "'runtime' is required for script nodes ('bun' or 'uv')",
                path: ['runtime'],
            });
        }
        if (data.timeout !== undefined && (data.timeout <= 0 || !isFinite(data.timeout))) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: "'timeout' must be a positive number (ms)",
                path: ['timeout'],
            });
        }
    }
    // Loop node: retry not supported
    if (hasLoop && data.retry !== undefined) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "'retry' is not supported on loop nodes (loop manages its own iteration)",
            path: ['retry'],
        });
    }
    // idle_timeout must be finite and positive
    if (data.idle_timeout !== undefined &&
        (data.idle_timeout <= 0 || !isFinite(data.idle_timeout))) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "'idle_timeout' must be a finite positive number (ms)",
            path: ['idle_timeout'],
        });
    }
})
    .transform((data) => {
    const id = data.id.trim();
    // Common base fields (sparse — only include defined values)
    const base = {
        id,
        ...(data.depends_on !== undefined && data.depends_on.length > 0
            ? { depends_on: data.depends_on }
            : {}),
        ...(data.when !== undefined ? { when: data.when } : {}),
        ...(data.trigger_rule !== undefined ? { trigger_rule: data.trigger_rule } : {}),
        ...(data.idle_timeout !== undefined ? { idle_timeout: data.idle_timeout } : {}),
        ...(data.always_run !== undefined ? { always_run: data.always_run } : {}),
        ...(data.output_type !== undefined ? { output_type: data.output_type } : {}),
    };
    // Shared optional fields (valid on AI and bash nodes)
    const shared = {
        ...(data.retry !== undefined ? { retry: data.retry } : {}),
    };
    // AI-only fields (not applicable to bash/loop nodes)
    const aiOnly = {
        ...(data.model !== undefined ? { model: data.model } : {}),
        ...(data.provider !== undefined ? { provider: data.provider } : {}),
        ...(data.context !== undefined ? { context: data.context } : {}),
        ...(data.output_format !== undefined ? { output_format: data.output_format } : {}),
        ...(data.allowed_tools !== undefined ? { allowed_tools: data.allowed_tools } : {}),
        ...(data.denied_tools !== undefined ? { denied_tools: data.denied_tools } : {}),
        ...(data.cost_cap !== undefined ? { cost_cap: data.cost_cap } : {}),
    };
    if (data.command !== undefined && data.command.trim().length > 0) {
        return { ...base, ...shared, ...aiOnly, command: data.command.trim() };
    }
    if (data.prompt !== undefined && data.prompt.trim().length > 0) {
        return { ...base, ...shared, ...aiOnly, prompt: data.prompt.trim() };
    }
    if (data.bash !== undefined && data.bash.trim().length > 0) {
        return {
            ...base,
            ...shared,
            bash: data.bash.trim(),
            ...(data.timeout !== undefined ? { timeout: data.timeout } : {}),
        };
    }
    if (data.script !== undefined && data.script.trim().length > 0) {
        // runtime is guaranteed by superRefine to be defined at this point
        if (!data.runtime)
            throw new Error('unreachable: runtime must be defined for script nodes');
        return {
            ...base,
            ...shared,
            script: data.script.trim(),
            runtime: data.runtime,
            ...(data.deps !== undefined ? { deps: data.deps } : {}),
            ...(data.timeout !== undefined ? { timeout: data.timeout } : {}),
        };
    }
    if (data.approval !== undefined) {
        return { ...base, ...shared, approval: data.approval };
    }
    if (data.cancel !== undefined && data.cancel.trim().length > 0) {
        return { ...base, ...shared, cancel: data.cancel.trim() };
    }
    // loop — guaranteed by superRefine to be defined at this point
    if (!data.loop)
        throw new Error('unreachable: loop must be defined after superRefine');
    return { ...base, loop: data.loop };
});
// ---------------------------------------------------------------------------
// Type guards (preserved from original types.ts)
// ---------------------------------------------------------------------------
/** Type guard: check if a DAG node is a command (named) node */
function isCommandNode(node) {
    return 'command' in node && typeof node.command === 'string';
}
/** Type guard: check if a DAG node is a prompt (inline) node */
function isPromptNode(node) {
    return 'prompt' in node && typeof node.prompt === 'string';
}
/** Type guard: check if a DAG node is a bash (shell script) node */
function isBashNode(node) {
    return 'bash' in node && typeof node.bash === 'string';
}
/** Type guard: check if a DAG node is a loop (iterative) node */
function isLoopNode(node) {
    return 'loop' in node && typeof node.loop === 'object' && node.loop !== null;
}
/** Type guard: check if a DAG node is an approval (human-in-the-loop) node */
function isApprovalNode(node) {
    return 'approval' in node && typeof node.approval === 'object' && node.approval !== null;
}
/** Type guard: check if a DAG node is a cancel (workflow termination) node */
function isCancelNode(node) {
    return 'cancel' in node && typeof node.cancel === 'string';
}
/** Type guard: check if a DAG node is a script node */
function isScriptNode(node) {
    return 'script' in node && typeof node.script === 'string';
}
/** Type guard: validates a value is a known TriggerRule */
function isTriggerRule(value) {
    return typeof value === 'string' && exports.TRIGGER_RULES.includes(value);
}
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
function isPersistableNode(node) {
    return (!isLoopNode(node) &&
        !isApprovalNode(node) &&
        !isCancelNode(node) &&
        !isScriptNode(node) &&
        !isBashNode(node));
}
//# sourceMappingURL=dag-node.js.map