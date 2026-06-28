import { z } from 'zod';
import type { ChimeraEvent as ChimeraEventBase } from '@chimera/context';
export declare const ChimeraEventSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"user_request">;
    text: z.ZodString;
    mode: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "user_request";
    text?: string;
    mode?: string;
}, {
    type?: "user_request";
    text?: string;
    mode?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"task_classified">;
    complexity: z.ZodObject<{
        score: z.ZodNumber;
        dimensions: z.ZodRecord<z.ZodString, z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        score?: number;
        dimensions?: Record<string, number>;
    }, {
        score?: number;
        dimensions?: Record<string, number>;
    }>;
    estimatedCost: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "task_classified";
    complexity?: {
        score?: number;
        dimensions?: Record<string, number>;
    };
    estimatedCost?: number;
}, {
    type?: "task_classified";
    complexity?: {
        score?: number;
        dimensions?: Record<string, number>;
    };
    estimatedCost?: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"task_decomposed">;
    subtasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        description: z.ZodString;
        dependencies: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        id?: string;
        description?: string;
        dependencies?: string[];
    }, {
        id?: string;
        description?: string;
        dependencies?: string[];
    }>, "many">;
    dependencyGraph: z.ZodObject<{
        nodes: z.ZodArray<z.ZodString, "many">;
        edges: z.ZodArray<z.ZodTuple<[z.ZodString, z.ZodString], null>, "many">;
    }, "strip", z.ZodTypeAny, {
        nodes?: string[];
        edges?: [string, string, ...unknown[]][];
    }, {
        nodes?: string[];
        edges?: [string, string, ...unknown[]][];
    }>;
}, "strip", z.ZodTypeAny, {
    type?: "task_decomposed";
    subtasks?: {
        id?: string;
        description?: string;
        dependencies?: string[];
    }[];
    dependencyGraph?: {
        nodes?: string[];
        edges?: [string, string, ...unknown[]][];
    };
}, {
    type?: "task_decomposed";
    subtasks?: {
        id?: string;
        description?: string;
        dependencies?: string[];
    }[];
    dependencyGraph?: {
        nodes?: string[];
        edges?: [string, string, ...unknown[]][];
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"agent_spawned">;
    agentId: z.ZodString;
    role: z.ZodString;
    provider: z.ZodString;
    model: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "agent_spawned";
    agentId?: string;
    role?: string;
    provider?: string;
    model?: string;
}, {
    type?: "agent_spawned";
    agentId?: string;
    role?: string;
    provider?: string;
    model?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"context_pack_created">;
    files: z.ZodArray<z.ZodString, "many">;
    tokenEstimate: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "context_pack_created";
    files?: string[];
    tokenEstimate?: number;
}, {
    type?: "context_pack_created";
    files?: string[];
    tokenEstimate?: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"draft_proposed">;
    agentId: z.ZodString;
    patchId: z.ZodString;
    confidence: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "draft_proposed";
    agentId?: string;
    patchId?: string;
    confidence?: number;
}, {
    type?: "draft_proposed";
    agentId?: string;
    patchId?: string;
    confidence?: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"verified">;
    agentId: z.ZodString;
    verdict: z.ZodEnum<["pass", "fail", "needs_revision"]>;
    findings: z.ZodArray<z.ZodObject<{
        description: z.ZodString;
        severity: z.ZodEnum<["high", "med", "low"]>;
        evidence: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        description?: string;
        severity?: "high" | "med" | "low";
        evidence?: string;
    }, {
        description?: string;
        severity?: "high" | "med" | "low";
        evidence?: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type?: "verified";
    agentId?: string;
    verdict?: "pass" | "fail" | "needs_revision";
    findings?: {
        description?: string;
        severity?: "high" | "med" | "low";
        evidence?: string;
    }[];
}, {
    type?: "verified";
    agentId?: string;
    verdict?: "pass" | "fail" | "needs_revision";
    findings?: {
        description?: string;
        severity?: "high" | "med" | "low";
        evidence?: string;
    }[];
}>, z.ZodObject<{
    type: z.ZodLiteral<"challenged">;
    agentId: z.ZodString;
    challenges: z.ZodArray<z.ZodString, "many">;
    alternatives: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    type?: "challenged";
    agentId?: string;
    challenges?: string[];
    alternatives?: string[];
}, {
    type?: "challenged";
    agentId?: string;
    challenges?: string[];
    alternatives?: string[];
}>, z.ZodObject<{
    type: z.ZodLiteral<"disagreement_detected">;
    agents: z.ZodArray<z.ZodString, "many">;
    issue: z.ZodString;
    resolution: z.ZodEnum<["voting", "challenger", "user"]>;
}, "strip", z.ZodTypeAny, {
    type?: "disagreement_detected";
    agents?: string[];
    issue?: string;
    resolution?: "voting" | "challenger" | "user";
}, {
    type?: "disagreement_detected";
    agents?: string[];
    issue?: string;
    resolution?: "voting" | "challenger" | "user";
}>, z.ZodObject<{
    type: z.ZodLiteral<"handoff_triggered">;
    fromAgent: z.ZodString;
    toAgent: z.ZodString;
    reason: z.ZodEnum<["context_threshold", "task_boundary"]>;
    format: z.ZodEnum<["compact", "delta"]>;
    tokenCount: z.ZodNumber;
    claimIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    type?: "handoff_triggered";
    fromAgent?: string;
    toAgent?: string;
    reason?: "context_threshold" | "task_boundary";
    format?: "compact" | "delta";
    tokenCount?: number;
    claimIds?: string[];
}, {
    type?: "handoff_triggered";
    fromAgent?: string;
    toAgent?: string;
    reason?: "context_threshold" | "task_boundary";
    format?: "compact" | "delta";
    tokenCount?: number;
    claimIds?: string[];
}>, z.ZodObject<{
    type: z.ZodLiteral<"handoff_validated">;
    accepted: z.ZodBoolean;
    checklist: z.ZodObject<{
        dataComplete: z.ZodBoolean;
        referencesGrounded: z.ZodBoolean;
        claimsVerified: z.ZodBoolean;
        capabilityMatch: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        dataComplete?: boolean;
        referencesGrounded?: boolean;
        claimsVerified?: boolean;
        capabilityMatch?: boolean;
    }, {
        dataComplete?: boolean;
        referencesGrounded?: boolean;
        claimsVerified?: boolean;
        capabilityMatch?: boolean;
    }>;
    clarifications: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    type?: "handoff_validated";
    accepted?: boolean;
    checklist?: {
        dataComplete?: boolean;
        referencesGrounded?: boolean;
        claimsVerified?: boolean;
        capabilityMatch?: boolean;
    };
    clarifications?: string[];
}, {
    type?: "handoff_validated";
    accepted?: boolean;
    checklist?: {
        dataComplete?: boolean;
        referencesGrounded?: boolean;
        claimsVerified?: boolean;
        capabilityMatch?: boolean;
    };
    clarifications?: string[];
}>, z.ZodObject<{
    type: z.ZodLiteral<"tool_call_requested">;
    call: z.ZodObject<{
        tool: z.ZodString;
        args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        tool?: string;
        args?: Record<string, unknown>;
    }, {
        tool?: string;
        args?: Record<string, unknown>;
    }>;
    policy: z.ZodEnum<["allow", "ask", "deny", "escalate"]>;
}, "strip", z.ZodTypeAny, {
    type?: "tool_call_requested";
    call?: {
        tool?: string;
        args?: Record<string, unknown>;
    };
    policy?: "allow" | "ask" | "deny" | "escalate";
}, {
    type?: "tool_call_requested";
    call?: {
        tool?: string;
        args?: Record<string, unknown>;
    };
    policy?: "allow" | "ask" | "deny" | "escalate";
}>, z.ZodObject<{
    type: z.ZodLiteral<"tool_call_result">;
    result: z.ZodObject<{
        tool: z.ZodString;
        output: z.ZodString;
        exitCode: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        tool?: string;
        output?: string;
        exitCode?: number;
    }, {
        tool?: string;
        output?: string;
        exitCode?: number;
    }>;
}, "strip", z.ZodTypeAny, {
    type?: "tool_call_result";
    result?: {
        tool?: string;
        output?: string;
        exitCode?: number;
    };
}, {
    type?: "tool_call_result";
    result?: {
        tool?: string;
        output?: string;
        exitCode?: number;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"patch_proposed">;
    patchId: z.ZodString;
    files: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    type?: "patch_proposed";
    files?: string[];
    patchId?: string;
}, {
    type?: "patch_proposed";
    files?: string[];
    patchId?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"check_result">;
    command: z.ZodString;
    exitCode: z.ZodNumber;
    outputRef: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "check_result";
    exitCode?: number;
    command?: string;
    outputRef?: string;
}, {
    type?: "check_result";
    exitCode?: number;
    command?: string;
    outputRef?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"review_finding">;
    severity: z.ZodEnum<["blocker", "warning", "note"]>;
    evidence: z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodOptional<z.ZodNumber>;
        description: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        description?: string;
        file?: string;
        line?: number;
    }, {
        description?: string;
        file?: string;
        line?: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type?: "review_finding";
    severity?: "blocker" | "warning" | "note";
    evidence?: {
        description?: string;
        file?: string;
        line?: number;
    }[];
}, {
    type?: "review_finding";
    severity?: "blocker" | "warning" | "note";
    evidence?: {
        description?: string;
        file?: string;
        line?: number;
    }[];
}>, z.ZodObject<{
    type: z.ZodLiteral<"cost_alert">;
    currentCost: z.ZodNumber;
    budget: z.ZodNumber;
    percentage: z.ZodNumber;
    action: z.ZodEnum<["warn", "throttle", "stop"]>;
}, "strip", z.ZodTypeAny, {
    type?: "cost_alert";
    currentCost?: number;
    budget?: number;
    percentage?: number;
    action?: "warn" | "throttle" | "stop";
}, {
    type?: "cost_alert";
    currentCost?: number;
    budget?: number;
    percentage?: number;
    action?: "warn" | "throttle" | "stop";
}>, z.ZodObject<{
    type: z.ZodLiteral<"context_threshold_reached">;
    agentId: z.ZodString;
    fillPercent: z.ZodNumber;
    tier: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "context_threshold_reached";
    agentId?: string;
    fillPercent?: number;
    tier?: number;
}, {
    type?: "context_threshold_reached";
    agentId?: string;
    fillPercent?: number;
    tier?: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"session_compacted">;
    summaryRef: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "session_compacted";
    summaryRef?: string;
}, {
    type?: "session_compacted";
    summaryRef?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"quality_gate_parallel_started">;
    reviewerId: z.ZodString;
    challengerId: z.ZodString;
    draftPreview: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "quality_gate_parallel_started";
    reviewerId?: string;
    challengerId?: string;
    draftPreview?: string;
}, {
    type?: "quality_gate_parallel_started";
    reviewerId?: string;
    challengerId?: string;
    draftPreview?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"quality_gate_parallel_completed">;
    reviewerId: z.ZodString;
    challengerId: z.ZodString;
    reviewerStatus: z.ZodEnum<["fulfilled", "rejected"]>;
    challengerStatus: z.ZodEnum<["fulfilled", "rejected"]>;
    durationMs: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "quality_gate_parallel_completed";
    reviewerId?: string;
    challengerId?: string;
    reviewerStatus?: "fulfilled" | "rejected";
    challengerStatus?: "fulfilled" | "rejected";
    durationMs?: number;
}, {
    type?: "quality_gate_parallel_completed";
    reviewerId?: string;
    challengerId?: string;
    reviewerStatus?: "fulfilled" | "rejected";
    challengerStatus?: "fulfilled" | "rejected";
    durationMs?: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"final_response">;
    status: z.ZodEnum<["done", "blocked", "needs_user"]>;
    cost: z.ZodNumber;
    agentCount: z.ZodNumber;
    output: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type?: "final_response";
    status?: "done" | "blocked" | "needs_user";
    output?: string;
    cost?: number;
    agentCount?: number;
}, {
    type?: "final_response";
    status?: "done" | "blocked" | "needs_user";
    output?: string;
    cost?: number;
    agentCount?: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"deliberation_result">;
    mode: z.ZodEnum<["solo", "duo", "trio", "fusion", "hive", "merge", "swarm", "auto"]>;
    output: z.ZodString;
    analysis: z.ZodObject<{
        thought: z.ZodString;
        consensus: z.ZodArray<z.ZodString, "many">;
        conflicts: z.ZodArray<z.ZodString, "many">;
        uniqueInsights: z.ZodArray<z.ZodString, "many">;
        blindSpots: z.ZodArray<z.ZodString, "many">;
        confidence: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        confidence?: number;
        thought?: string;
        consensus?: string[];
        conflicts?: string[];
        uniqueInsights?: string[];
        blindSpots?: string[];
    }, {
        confidence?: number;
        thought?: string;
        consensus?: string[];
        conflicts?: string[];
        uniqueInsights?: string[];
        blindSpots?: string[];
    }>;
}, "strip", z.ZodTypeAny, {
    type?: "deliberation_result";
    mode?: "solo" | "duo" | "trio" | "fusion" | "hive" | "merge" | "swarm" | "auto";
    output?: string;
    analysis?: {
        confidence?: number;
        thought?: string;
        consensus?: string[];
        conflicts?: string[];
        uniqueInsights?: string[];
        blindSpots?: string[];
    };
}, {
    type?: "deliberation_result";
    mode?: "solo" | "duo" | "trio" | "fusion" | "hive" | "merge" | "swarm" | "auto";
    output?: string;
    analysis?: {
        confidence?: number;
        thought?: string;
        consensus?: string[];
        conflicts?: string[];
        uniqueInsights?: string[];
        blindSpots?: string[];
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"provenance_claim">;
    claimId: z.ZodString;
    source: z.ZodString;
    agentId: z.ZodString;
    confidence: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "provenance_claim";
    agentId?: string;
    confidence?: number;
    claimId?: string;
    source?: string;
}, {
    type?: "provenance_claim";
    agentId?: string;
    confidence?: number;
    claimId?: string;
    source?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"workflow_registered">;
    name: z.ZodString;
    path: z.ZodOptional<z.ZodString>;
    stepCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "workflow_registered";
    path?: string;
    name?: string;
    stepCount?: number;
}, {
    type?: "workflow_registered";
    path?: string;
    name?: string;
    stepCount?: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"workflow_started">;
    task: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "workflow_started";
    task?: string;
}, {
    type?: "workflow_started";
    task?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"workflow_completed">;
    task: z.ZodString;
    output: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    type?: "workflow_completed";
    output?: unknown;
    task?: string;
}, {
    type?: "workflow_completed";
    output?: unknown;
    task?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"workflow_run_started">;
    name: z.ZodString;
    runId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "workflow_run_started";
    name?: string;
    runId?: string;
}, {
    type?: "workflow_run_started";
    name?: string;
    runId?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"workflow_run_completed">;
    name: z.ZodString;
    runId: z.ZodString;
    status: z.ZodEnum<["success", "error", "cancelled"]>;
    durationMs: z.ZodNumber;
    stepCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "workflow_run_completed";
    status?: "success" | "error" | "cancelled";
    durationMs?: number;
    name?: string;
    stepCount?: number;
    runId?: string;
}, {
    type?: "workflow_run_completed";
    status?: "success" | "error" | "cancelled";
    durationMs?: number;
    name?: string;
    stepCount?: number;
    runId?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"workflow_step_completed">;
    name: z.ZodString;
    runId: z.ZodString;
    stepId: z.ZodString;
    kind: z.ZodEnum<["llm", "tool", "parallel", "sequence", "gate", "loop"]>;
    durationMs: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "workflow_step_completed";
    durationMs?: number;
    name?: string;
    runId?: string;
    stepId?: string;
    kind?: "tool" | "llm" | "parallel" | "sequence" | "gate" | "loop";
}, {
    type?: "workflow_step_completed";
    durationMs?: number;
    name?: string;
    runId?: string;
    stepId?: string;
    kind?: "tool" | "llm" | "parallel" | "sequence" | "gate" | "loop";
}>, z.ZodObject<{
    type: z.ZodLiteral<"loop_iteration_started">;
    runId: z.ZodString;
    stepId: z.ZodString;
    iteration: z.ZodNumber;
    maxIterations: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "loop_iteration_started";
    runId?: string;
    stepId?: string;
    iteration?: number;
    maxIterations?: number;
}, {
    type?: "loop_iteration_started";
    runId?: string;
    stepId?: string;
    iteration?: number;
    maxIterations?: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"loop_iteration_completed">;
    runId: z.ZodString;
    stepId: z.ZodString;
    iteration: z.ZodNumber;
    durationMs: z.ZodNumber;
    completionDetected: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    type?: "loop_iteration_completed";
    durationMs?: number;
    runId?: string;
    stepId?: string;
    iteration?: number;
    completionDetected?: boolean;
}, {
    type?: "loop_iteration_completed";
    durationMs?: number;
    runId?: string;
    stepId?: string;
    iteration?: number;
    completionDetected?: boolean;
}>, z.ZodObject<{
    type: z.ZodLiteral<"loop_iteration_failed">;
    runId: z.ZodString;
    stepId: z.ZodString;
    iteration: z.ZodNumber;
    error: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "loop_iteration_failed";
    runId?: string;
    error?: string;
    stepId?: string;
    iteration?: number;
}, {
    type?: "loop_iteration_failed";
    runId?: string;
    error?: string;
    stepId?: string;
    iteration?: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"workflow_dispatched">;
    workflowRunId: z.ZodString;
    workflowName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "workflow_dispatched";
    workflowRunId?: string;
    workflowName?: string;
}, {
    type?: "workflow_dispatched";
    workflowRunId?: string;
    workflowName?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"workflow_dispatch_failed">;
    workflowRunId: z.ZodString;
    workflowName: z.ZodString;
    error: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "workflow_dispatch_failed";
    error?: string;
    workflowRunId?: string;
    workflowName?: string;
}, {
    type?: "workflow_dispatch_failed";
    error?: string;
    workflowRunId?: string;
    workflowName?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"skill_loaded">;
    skillName: z.ZodString;
    source: z.ZodEnum<["workspace", "global", "pack", "bundled"]>;
    bytes: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "skill_loaded";
    source?: "workspace" | "global" | "pack" | "bundled";
    skillName?: string;
    bytes?: number;
}, {
    type?: "skill_loaded";
    source?: "workspace" | "global" | "pack" | "bundled";
    skillName?: string;
    bytes?: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"learning_completed">;
    skillsCreated: z.ZodNumber;
    skillsUpdated: z.ZodNumber;
    workflowsCreated: z.ZodNumber;
    workflowsUpdated: z.ZodNumber;
    packsCreated: z.ZodNumber;
    durationMs: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "learning_completed";
    durationMs?: number;
    skillsCreated?: number;
    skillsUpdated?: number;
    workflowsCreated?: number;
    workflowsUpdated?: number;
    packsCreated?: number;
}, {
    type?: "learning_completed";
    durationMs?: number;
    skillsCreated?: number;
    skillsUpdated?: number;
    workflowsCreated?: number;
    workflowsUpdated?: number;
    packsCreated?: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"skill_synthesized">;
    name: z.ZodString;
    confidence: z.ZodNumber;
    action: z.ZodEnum<["created", "updated"]>;
}, "strip", z.ZodTypeAny, {
    type?: "skill_synthesized";
    confidence?: number;
    action?: "created" | "updated";
    name?: string;
}, {
    type?: "skill_synthesized";
    confidence?: number;
    action?: "created" | "updated";
    name?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"workflow_synthesized">;
    name: z.ZodString;
    confidence: z.ZodNumber;
    action: z.ZodEnum<["created", "updated"]>;
}, "strip", z.ZodTypeAny, {
    type?: "workflow_synthesized";
    confidence?: number;
    action?: "created" | "updated";
    name?: string;
}, {
    type?: "workflow_synthesized";
    confidence?: number;
    action?: "created" | "updated";
    name?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"auto_preset_selected">;
    task: z.ZodString;
    complexity: z.ZodNumber;
    selectedPreset: z.ZodEnum<["solo", "duo", "trio", "fusion", "merge", "hive", "swarm", "auto"]>;
    taskType: z.ZodString;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "auto_preset_selected";
    complexity?: number;
    task?: string;
    selectedPreset?: "solo" | "duo" | "trio" | "fusion" | "hive" | "merge" | "swarm" | "auto";
    taskType?: string;
    timestamp?: number;
}, {
    type?: "auto_preset_selected";
    complexity?: number;
    task?: string;
    selectedPreset?: "solo" | "duo" | "trio" | "fusion" | "hive" | "merge" | "swarm" | "auto";
    taskType?: string;
    timestamp?: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"mode_preset_warning">;
    mode: z.ZodString;
    preset: z.ZodString;
    resolvedPreset: z.ZodString;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "mode_preset_warning";
    mode?: string;
    reason?: string;
    preset?: string;
    resolvedPreset?: string;
}, {
    type?: "mode_preset_warning";
    mode?: string;
    reason?: string;
    preset?: string;
    resolvedPreset?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"mode_preset_resolved">;
    mode: z.ZodString;
    preset: z.ZodString;
    complexity: z.ZodOptional<z.ZodNumber>;
    task: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type?: "mode_preset_resolved";
    mode?: string;
    complexity?: number;
    task?: string;
    preset?: string;
}, {
    type?: "mode_preset_resolved";
    mode?: string;
    complexity?: number;
    task?: string;
    preset?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"error">;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "error";
    message?: string;
}, {
    type?: "error";
    message?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"fusion_started">;
    task: z.ZodString;
    models: z.ZodArray<z.ZodString, "many">;
    judge: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "fusion_started";
    task?: string;
    models?: string[];
    judge?: string;
}, {
    type?: "fusion_started";
    task?: string;
    models?: string[];
    judge?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"fusion_completed">;
    task: z.ZodString;
    durationMs: z.ZodNumber;
    totalCostUsd: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "fusion_completed";
    durationMs?: number;
    task?: string;
    totalCostUsd?: number;
}, {
    type?: "fusion_completed";
    durationMs?: number;
    task?: string;
    totalCostUsd?: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"fusion_provider_error">;
    modelId: z.ZodString;
    error: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "fusion_provider_error";
    error?: string;
    modelId?: string;
}, {
    type?: "fusion_provider_error";
    error?: string;
    modelId?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"fusion_budget_exceeded">;
    currentCost: z.ZodNumber;
    budget: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "fusion_budget_exceeded";
    currentCost?: number;
    budget?: number;
}, {
    type?: "fusion_budget_exceeded";
    currentCost?: number;
    budget?: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"fusion_recursion_blocked">;
    depth: z.ZodNumber;
    maxDepth: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "fusion_recursion_blocked";
    depth?: number;
    maxDepth?: number;
}, {
    type?: "fusion_recursion_blocked";
    depth?: number;
    maxDepth?: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"fusion_fallback_judge">;
    failedModel: z.ZodString;
    error: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "fusion_fallback_judge";
    error?: string;
    failedModel?: string;
}, {
    type?: "fusion_fallback_judge";
    error?: string;
    failedModel?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"fusion_judge_parse_error">;
    raw: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type?: "fusion_judge_parse_error";
    raw?: string;
}, {
    type?: "fusion_judge_parse_error";
    raw?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"provider_rate_limited">;
    providerId: z.ZodString;
    retryAfterMs: z.ZodNumber;
    remainingRpm: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type?: "provider_rate_limited";
    providerId?: string;
    retryAfterMs?: number;
    remainingRpm?: number;
}, {
    type?: "provider_rate_limited";
    providerId?: string;
    retryAfterMs?: number;
    remainingRpm?: number;
}>]>;
export type ChimeraEvent = ChimeraEventBase;
//# sourceMappingURL=events.d.ts.map