"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChimeraEventSchema = void 0;
const zod_1 = require("zod");
exports.ChimeraEventSchema = zod_1.z.discriminatedUnion('type', [
    zod_1.z.object({
        type: zod_1.z.literal('user_request'),
        text: zod_1.z.string(),
        mode: zod_1.z.string(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('task_classified'),
        complexity: zod_1.z.object({ score: zod_1.z.number(), dimensions: zod_1.z.record(zod_1.z.number()) }),
        estimatedCost: zod_1.z.number(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('task_decomposed'),
        subtasks: zod_1.z.array(zod_1.z.object({ id: zod_1.z.string(), description: zod_1.z.string(), dependencies: zod_1.z.array(zod_1.z.string()) })),
        dependencyGraph: zod_1.z.object({ nodes: zod_1.z.array(zod_1.z.string()), edges: zod_1.z.array(zod_1.z.tuple([zod_1.z.string(), zod_1.z.string()])) }),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('agent_spawned'),
        agentId: zod_1.z.string(),
        role: zod_1.z.string(),
        provider: zod_1.z.string(),
        model: zod_1.z.string(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('context_pack_created'),
        files: zod_1.z.array(zod_1.z.string()),
        tokenEstimate: zod_1.z.number(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('draft_proposed'),
        agentId: zod_1.z.string(),
        patchId: zod_1.z.string(),
        confidence: zod_1.z.number(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('verified'),
        agentId: zod_1.z.string(),
        verdict: zod_1.z.enum(['pass', 'fail', 'needs_revision']),
        findings: zod_1.z.array(zod_1.z.object({ description: zod_1.z.string(), severity: zod_1.z.enum(['high', 'med', 'low']), evidence: zod_1.z.string() })),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('challenged'),
        agentId: zod_1.z.string(),
        challenges: zod_1.z.array(zod_1.z.string()),
        alternatives: zod_1.z.array(zod_1.z.string()),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('disagreement_detected'),
        agents: zod_1.z.array(zod_1.z.string()),
        issue: zod_1.z.string(),
        resolution: zod_1.z.enum(['voting', 'challenger', 'user']),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('handoff_triggered'),
        fromAgent: zod_1.z.string(),
        toAgent: zod_1.z.string(),
        reason: zod_1.z.enum(['context_threshold', 'task_boundary']),
        format: zod_1.z.enum(['compact', 'delta']),
        tokenCount: zod_1.z.number(),
        claimIds: zod_1.z.array(zod_1.z.string()),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('handoff_validated'),
        accepted: zod_1.z.boolean(),
        checklist: zod_1.z.object({
            dataComplete: zod_1.z.boolean(),
            referencesGrounded: zod_1.z.boolean(),
            claimsVerified: zod_1.z.boolean(),
            capabilityMatch: zod_1.z.boolean(),
        }),
        clarifications: zod_1.z.array(zod_1.z.string()),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('tool_call_requested'),
        call: zod_1.z.object({ tool: zod_1.z.string(), args: zod_1.z.record(zod_1.z.unknown()) }),
        policy: zod_1.z.enum(['allow', 'ask', 'deny']),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('tool_call_result'),
        result: zod_1.z.object({ tool: zod_1.z.string(), output: zod_1.z.string(), exitCode: zod_1.z.number().optional() }),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('patch_proposed'),
        patchId: zod_1.z.string(),
        files: zod_1.z.array(zod_1.z.string()),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('check_result'),
        command: zod_1.z.string(),
        exitCode: zod_1.z.number(),
        outputRef: zod_1.z.string(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('review_finding'),
        severity: zod_1.z.enum(['blocker', 'warning', 'note']),
        evidence: zod_1.z.array(zod_1.z.object({ file: zod_1.z.string(), line: zod_1.z.number().optional(), description: zod_1.z.string() })),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('cost_alert'),
        currentCost: zod_1.z.number(),
        budget: zod_1.z.number(),
        percentage: zod_1.z.number(),
        action: zod_1.z.enum(['warn', 'throttle', 'stop']),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('context_threshold_reached'),
        agentId: zod_1.z.string(),
        fillPercent: zod_1.z.number(),
        tier: zod_1.z.number(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('session_compacted'),
        summaryRef: zod_1.z.string(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('final_response'),
        status: zod_1.z.enum(['done', 'blocked', 'needs_user']),
        cost: zod_1.z.number(),
        agentCount: zod_1.z.number(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('provenance_claim'),
        claimId: zod_1.z.string(),
        source: zod_1.z.string(),
        agentId: zod_1.z.string(),
        confidence: zod_1.z.number(),
    }),
]);
//# sourceMappingURL=events.js.map