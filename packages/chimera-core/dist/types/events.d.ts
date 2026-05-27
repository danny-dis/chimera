import { z } from 'zod';
export declare const ChimeraEventSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"user_request">;
    text: z.ZodString;
    mode: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "user_request";
    text: string;
    mode: string;
}, {
    type: "user_request";
    text: string;
    mode: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"task_classified">;
    complexity: z.ZodObject<{
        score: z.ZodNumber;
        dimensions: z.ZodRecord<z.ZodString, z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        score: number;
        dimensions: Record<string, number>;
    }, {
        score: number;
        dimensions: Record<string, number>;
    }>;
    estimatedCost: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "task_classified";
    complexity: {
        score: number;
        dimensions: Record<string, number>;
    };
    estimatedCost: number;
}, {
    type: "task_classified";
    complexity: {
        score: number;
        dimensions: Record<string, number>;
    };
    estimatedCost: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"task_decomposed">;
    subtasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        description: z.ZodString;
        dependencies: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        id: string;
        description: string;
        dependencies: string[];
    }, {
        id: string;
        description: string;
        dependencies: string[];
    }>, "many">;
    dependencyGraph: z.ZodObject<{
        nodes: z.ZodArray<z.ZodString, "many">;
        edges: z.ZodArray<z.ZodTuple<[z.ZodString, z.ZodString], null>, "many">;
    }, "strip", z.ZodTypeAny, {
        nodes: string[];
        edges: [string, string][];
    }, {
        nodes: string[];
        edges: [string, string][];
    }>;
}, "strip", z.ZodTypeAny, {
    type: "task_decomposed";
    subtasks: {
        id: string;
        description: string;
        dependencies: string[];
    }[];
    dependencyGraph: {
        nodes: string[];
        edges: [string, string][];
    };
}, {
    type: "task_decomposed";
    subtasks: {
        id: string;
        description: string;
        dependencies: string[];
    }[];
    dependencyGraph: {
        nodes: string[];
        edges: [string, string][];
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"agent_spawned">;
    agentId: z.ZodString;
    role: z.ZodString;
    provider: z.ZodString;
    model: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "agent_spawned";
    agentId: string;
    role: string;
    provider: string;
    model: string;
}, {
    type: "agent_spawned";
    agentId: string;
    role: string;
    provider: string;
    model: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"context_pack_created">;
    files: z.ZodArray<z.ZodString, "many">;
    tokenEstimate: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "context_pack_created";
    files: string[];
    tokenEstimate: number;
}, {
    type: "context_pack_created";
    files: string[];
    tokenEstimate: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"draft_proposed">;
    agentId: z.ZodString;
    patchId: z.ZodString;
    confidence: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "draft_proposed";
    agentId: string;
    patchId: string;
    confidence: number;
}, {
    type: "draft_proposed";
    agentId: string;
    patchId: string;
    confidence: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"verified">;
    agentId: z.ZodString;
    verdict: z.ZodEnum<["pass", "fail", "needs_revision"]>;
    findings: z.ZodArray<z.ZodObject<{
        description: z.ZodString;
        severity: z.ZodEnum<["high", "med", "low"]>;
        evidence: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        description: string;
        severity: "high" | "med" | "low";
        evidence: string;
    }, {
        description: string;
        severity: "high" | "med" | "low";
        evidence: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type: "verified";
    agentId: string;
    verdict: "pass" | "fail" | "needs_revision";
    findings: {
        description: string;
        severity: "high" | "med" | "low";
        evidence: string;
    }[];
}, {
    type: "verified";
    agentId: string;
    verdict: "pass" | "fail" | "needs_revision";
    findings: {
        description: string;
        severity: "high" | "med" | "low";
        evidence: string;
    }[];
}>, z.ZodObject<{
    type: z.ZodLiteral<"challenged">;
    agentId: z.ZodString;
    challenges: z.ZodArray<z.ZodString, "many">;
    alternatives: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    type: "challenged";
    agentId: string;
    challenges: string[];
    alternatives: string[];
}, {
    type: "challenged";
    agentId: string;
    challenges: string[];
    alternatives: string[];
}>, z.ZodObject<{
    type: z.ZodLiteral<"disagreement_detected">;
    agents: z.ZodArray<z.ZodString, "many">;
    issue: z.ZodString;
    resolution: z.ZodEnum<["voting", "challenger", "user"]>;
}, "strip", z.ZodTypeAny, {
    type: "disagreement_detected";
    agents: string[];
    issue: string;
    resolution: "voting" | "challenger" | "user";
}, {
    type: "disagreement_detected";
    agents: string[];
    issue: string;
    resolution: "voting" | "challenger" | "user";
}>, z.ZodObject<{
    type: z.ZodLiteral<"handoff_triggered">;
    fromAgent: z.ZodString;
    toAgent: z.ZodString;
    reason: z.ZodEnum<["context_threshold", "task_boundary"]>;
    format: z.ZodEnum<["compact", "delta"]>;
    tokenCount: z.ZodNumber;
    claimIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    type: "handoff_triggered";
    fromAgent: string;
    toAgent: string;
    reason: "context_threshold" | "task_boundary";
    format: "compact" | "delta";
    tokenCount: number;
    claimIds: string[];
}, {
    type: "handoff_triggered";
    fromAgent: string;
    toAgent: string;
    reason: "context_threshold" | "task_boundary";
    format: "compact" | "delta";
    tokenCount: number;
    claimIds: string[];
}>, z.ZodObject<{
    type: z.ZodLiteral<"handoff_validated">;
    accepted: z.ZodBoolean;
    checklist: z.ZodObject<{
        dataComplete: z.ZodBoolean;
        referencesGrounded: z.ZodBoolean;
        claimsVerified: z.ZodBoolean;
        capabilityMatch: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        dataComplete: boolean;
        referencesGrounded: boolean;
        claimsVerified: boolean;
        capabilityMatch: boolean;
    }, {
        dataComplete: boolean;
        referencesGrounded: boolean;
        claimsVerified: boolean;
        capabilityMatch: boolean;
    }>;
    clarifications: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    type: "handoff_validated";
    accepted: boolean;
    checklist: {
        dataComplete: boolean;
        referencesGrounded: boolean;
        claimsVerified: boolean;
        capabilityMatch: boolean;
    };
    clarifications: string[];
}, {
    type: "handoff_validated";
    accepted: boolean;
    checklist: {
        dataComplete: boolean;
        referencesGrounded: boolean;
        claimsVerified: boolean;
        capabilityMatch: boolean;
    };
    clarifications: string[];
}>, z.ZodObject<{
    type: z.ZodLiteral<"tool_call_requested">;
    call: z.ZodObject<{
        tool: z.ZodString;
        args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        tool: string;
        args: Record<string, unknown>;
    }, {
        tool: string;
        args: Record<string, unknown>;
    }>;
    policy: z.ZodEnum<["allow", "ask", "deny"]>;
}, "strip", z.ZodTypeAny, {
    type: "tool_call_requested";
    call: {
        tool: string;
        args: Record<string, unknown>;
    };
    policy: "allow" | "ask" | "deny";
}, {
    type: "tool_call_requested";
    call: {
        tool: string;
        args: Record<string, unknown>;
    };
    policy: "allow" | "ask" | "deny";
}>, z.ZodObject<{
    type: z.ZodLiteral<"tool_call_result">;
    result: z.ZodObject<{
        tool: z.ZodString;
        output: z.ZodString;
        exitCode: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        tool: string;
        output: string;
        exitCode?: number | undefined;
    }, {
        tool: string;
        output: string;
        exitCode?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "tool_call_result";
    result: {
        tool: string;
        output: string;
        exitCode?: number | undefined;
    };
}, {
    type: "tool_call_result";
    result: {
        tool: string;
        output: string;
        exitCode?: number | undefined;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"patch_proposed">;
    patchId: z.ZodString;
    files: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    type: "patch_proposed";
    files: string[];
    patchId: string;
}, {
    type: "patch_proposed";
    files: string[];
    patchId: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"check_result">;
    command: z.ZodString;
    exitCode: z.ZodNumber;
    outputRef: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "check_result";
    exitCode: number;
    command: string;
    outputRef: string;
}, {
    type: "check_result";
    exitCode: number;
    command: string;
    outputRef: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"review_finding">;
    severity: z.ZodEnum<["blocker", "warning", "note"]>;
    evidence: z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodOptional<z.ZodNumber>;
        description: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        description: string;
        file: string;
        line?: number | undefined;
    }, {
        description: string;
        file: string;
        line?: number | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type: "review_finding";
    severity: "blocker" | "warning" | "note";
    evidence: {
        description: string;
        file: string;
        line?: number | undefined;
    }[];
}, {
    type: "review_finding";
    severity: "blocker" | "warning" | "note";
    evidence: {
        description: string;
        file: string;
        line?: number | undefined;
    }[];
}>, z.ZodObject<{
    type: z.ZodLiteral<"cost_alert">;
    currentCost: z.ZodNumber;
    budget: z.ZodNumber;
    percentage: z.ZodNumber;
    action: z.ZodEnum<["warn", "throttle", "stop"]>;
}, "strip", z.ZodTypeAny, {
    type: "cost_alert";
    currentCost: number;
    budget: number;
    percentage: number;
    action: "warn" | "throttle" | "stop";
}, {
    type: "cost_alert";
    currentCost: number;
    budget: number;
    percentage: number;
    action: "warn" | "throttle" | "stop";
}>, z.ZodObject<{
    type: z.ZodLiteral<"context_threshold_reached">;
    agentId: z.ZodString;
    fillPercent: z.ZodNumber;
    tier: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "context_threshold_reached";
    agentId: string;
    fillPercent: number;
    tier: number;
}, {
    type: "context_threshold_reached";
    agentId: string;
    fillPercent: number;
    tier: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"session_compacted">;
    summaryRef: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "session_compacted";
    summaryRef: string;
}, {
    type: "session_compacted";
    summaryRef: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"final_response">;
    status: z.ZodEnum<["done", "blocked", "needs_user"]>;
    cost: z.ZodNumber;
    agentCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "final_response";
    status: "done" | "blocked" | "needs_user";
    cost: number;
    agentCount: number;
}, {
    type: "final_response";
    status: "done" | "blocked" | "needs_user";
    cost: number;
    agentCount: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"provenance_claim">;
    claimId: z.ZodString;
    source: z.ZodString;
    agentId: z.ZodString;
    confidence: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "provenance_claim";
    agentId: string;
    confidence: number;
    claimId: string;
    source: string;
}, {
    type: "provenance_claim";
    agentId: string;
    confidence: number;
    claimId: string;
    source: string;
}>]>;
export type ChimeraEvent = z.infer<typeof ChimeraEventSchema>;
//# sourceMappingURL=events.d.ts.map