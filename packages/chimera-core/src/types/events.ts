import { z } from 'zod';
import type { ChimeraEvent as ChimeraEventBase } from '@chimera/context';

export const ChimeraEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user_request'),
    text: z.string(),
    mode: z.string(),
  }),
  z.object({
    type: z.literal('task_classified'),
    complexity: z.object({ score: z.number(), dimensions: z.record(z.number()) }),
    estimatedCost: z.number(),
  }),
  z.object({
    type: z.literal('task_decomposed'),
    subtasks: z.array(z.object({ id: z.string(), description: z.string(), dependencies: z.array(z.string()) })),
    dependencyGraph: z.object({ nodes: z.array(z.string()), edges: z.array(z.tuple([z.string(), z.string()])) }),
  }),
  z.object({
    type: z.literal('agent_spawned'),
    agentId: z.string(),
    role: z.string(),
    provider: z.string(),
    model: z.string(),
  }),
  z.object({
    type: z.literal('context_pack_created'),
    files: z.array(z.string()),
    tokenEstimate: z.number(),
  }),
  z.object({
    type: z.literal('draft_proposed'),
    agentId: z.string(),
    patchId: z.string(),
    confidence: z.number(),
  }),
  z.object({
    type: z.literal('verified'),
    agentId: z.string(),
    verdict: z.enum(['pass', 'fail', 'needs_revision']),
    findings: z.array(z.object({ description: z.string(), severity: z.enum(['high', 'med', 'low']), evidence: z.string() })),
  }),
  z.object({
    type: z.literal('challenged'),
    agentId: z.string(),
    challenges: z.array(z.string()),
    alternatives: z.array(z.string()),
  }),
  z.object({
    type: z.literal('disagreement_detected'),
    agents: z.array(z.string()),
    issue: z.string(),
    resolution: z.enum(['voting', 'challenger', 'user']),
  }),
  z.object({
    type: z.literal('handoff_triggered'),
    fromAgent: z.string(),
    toAgent: z.string(),
    reason: z.enum(['context_threshold', 'task_boundary']),
    format: z.enum(['compact', 'delta']),
    tokenCount: z.number(),
    claimIds: z.array(z.string()),
  }),
  z.object({
    type: z.literal('handoff_validated'),
    accepted: z.boolean(),
    checklist: z.object({
      dataComplete: z.boolean(),
      referencesGrounded: z.boolean(),
      claimsVerified: z.boolean(),
      capabilityMatch: z.boolean(),
    }),
    clarifications: z.array(z.string()),
  }),
  z.object({
    type: z.literal('tool_call_requested'),
    call: z.object({ tool: z.string(), args: z.record(z.unknown()) }),
    policy: z.enum(['allow', 'ask', 'deny', 'escalate']),
  }),
  z.object({
    type: z.literal('tool_call_result'),
    result: z.object({ tool: z.string(), output: z.string(), exitCode: z.number().optional() }),
  }),
  z.object({
    type: z.literal('patch_proposed'),
    patchId: z.string(),
    files: z.array(z.string()),
  }),
  z.object({
    type: z.literal('check_result'),
    command: z.string(),
    exitCode: z.number(),
    outputRef: z.string(),
  }),
  z.object({
    type: z.literal('review_finding'),
    severity: z.enum(['blocker', 'warning', 'note']),
    evidence: z.array(z.object({ file: z.string(), line: z.number().optional(), description: z.string() })),
  }),
  z.object({
    type: z.literal('cost_alert'),
    currentCost: z.number(),
    budget: z.number(),
    percentage: z.number(),
    action: z.enum(['warn', 'throttle', 'stop']),
  }),
  z.object({
    type: z.literal('context_threshold_reached'),
    agentId: z.string(),
    fillPercent: z.number(),
    tier: z.number(),
  }),
  z.object({
    type: z.literal('session_compacted'),
    summaryRef: z.string(),
  }),
  z.object({
    type: z.literal('quality_gate_parallel_started'),
    reviewerId: z.string(),
    challengerId: z.string(),
    draftPreview: z.string(),
  }),
  z.object({
    type: z.literal('quality_gate_parallel_completed'),
    reviewerId: z.string(),
    challengerId: z.string(),
    reviewerStatus: z.enum(['fulfilled', 'rejected']),
    challengerStatus: z.enum(['fulfilled', 'rejected']),
    durationMs: z.number(),
  }),
  z.object({
    type: z.literal('final_response'),
    status: z.enum(['done', 'blocked', 'needs_user']),
    cost: z.number(),
    agentCount: z.number(),
    output: z.string().optional(),
  }),
  z.object({
    type: z.literal('deliberation_result'),
    mode: z.enum(['solo', 'duo', 'trio', 'fusion', 'hive', 'merge', 'swarm', 'auto']),
    output: z.string(),
    analysis: z.object({
      thought: z.string(),
      consensus: z.array(z.string()),
      conflicts: z.array(z.string()),
      uniqueInsights: z.array(z.string()),
      blindSpots: z.array(z.string()),
      confidence: z.number(),
    }),
  }),
  z.object({
    type: z.literal('provenance_claim'),
    claimId: z.string(),
    source: z.string(),
    agentId: z.string(),
    confidence: z.number(),
  }),
  // --- Workflow + skill telemetry (added 2026-06) ---
  z.object({
    type: z.literal('workflow_registered'),
    name: z.string(),
    path: z.string().optional(),
    stepCount: z.number(),
  }),
  z.object({
    type: z.literal('workflow_started'),
    task: z.string(),
  }),
  z.object({
    type: z.literal('workflow_completed'),
    task: z.string(),
    output: z.unknown(),
  }),
  z.object({
    type: z.literal('workflow_run_started'),
    name: z.string(),
    runId: z.string(),
  }),
  z.object({
    type: z.literal('workflow_run_completed'),
    name: z.string(),
    runId: z.string(),
    status: z.enum(['success', 'error', 'cancelled']),
    durationMs: z.number(),
    stepCount: z.number(),
  }),
  z.object({
    type: z.literal('workflow_step_completed'),
    name: z.string(),
    runId: z.string(),
    stepId: z.string(),
    kind: z.enum(['llm', 'tool', 'parallel', 'sequence', 'gate', 'loop']),
    durationMs: z.number(),
  }),
  z.object({
    type: z.literal('loop_iteration_started'),
    runId: z.string(),
    stepId: z.string(),
    iteration: z.number(),
    maxIterations: z.number(),
  }),
  z.object({
    type: z.literal('loop_iteration_completed'),
    runId: z.string(),
    stepId: z.string(),
    iteration: z.number(),
    durationMs: z.number(),
    completionDetected: z.boolean(),
  }),
  z.object({
    type: z.literal('loop_iteration_failed'),
    runId: z.string(),
    stepId: z.string(),
    iteration: z.number(),
    error: z.string(),
  }),
  // --- Workflow dispatch (background execution) ---
  z.object({
    type: z.literal('workflow_dispatched'),
    workflowRunId: z.string(),
    workflowName: z.string(),
  }),
  z.object({
    type: z.literal('workflow_dispatch_failed'),
    workflowRunId: z.string(),
    workflowName: z.string(),
    error: z.string(),
  }),
  z.object({
    type: z.literal('skill_loaded'),
    skillName: z.string(),
    source: z.enum(['workspace', 'global', 'pack', 'bundled']),
    bytes: z.number(),
  }),
  // --- Learning telemetry (auto-synthesis) ---
  z.object({
    type: z.literal('learning_completed'),
    skillsCreated: z.number(),
    skillsUpdated: z.number(),
    workflowsCreated: z.number(),
    workflowsUpdated: z.number(),
    packsCreated: z.number(),
    durationMs: z.number(),
  }),
  z.object({
    type: z.literal('skill_synthesized'),
    name: z.string(),
    confidence: z.number(),
    action: z.enum(['created', 'updated']),
  }),
  z.object({
    type: z.literal('workflow_synthesized'),
    name: z.string(),
    confidence: z.number(),
    action: z.enum(['created', 'updated']),
  }),
  // --- Auto preset selection telemetry ---
  z.object({
    type: z.literal('auto_preset_selected'),
    task: z.string(),
    complexity: z.number(),
    selectedPreset: z.enum(['solo', 'duo', 'trio', 'fusion', 'merge', 'hive', 'swarm', 'auto']),
    taskType: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('mode_preset_warning'),
    mode: z.string(),
    preset: z.string(),
    resolvedPreset: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal('mode_preset_resolved'),
    mode: z.string(),
    preset: z.string(),
    complexity: z.number().optional(),
    task: z.string().optional(),
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
  }),
  // --- Fusion mode telemetry ---
  z.object({
    type: z.literal('fusion_started'),
    task: z.string(),
    models: z.array(z.string()),
    judge: z.string(),
  }),
  z.object({
    type: z.literal('fusion_completed'),
    task: z.string(),
    durationMs: z.number(),
    totalCostUsd: z.number(),
  }),
  z.object({
    type: z.literal('fusion_provider_error'),
    modelId: z.string(),
    error: z.string(),
  }),
  z.object({
    type: z.literal('fusion_budget_exceeded'),
    currentCost: z.number(),
    budget: z.number(),
  }),
  z.object({
    type: z.literal('fusion_recursion_blocked'),
    depth: z.number(),
    maxDepth: z.number(),
  }),
  z.object({
    type: z.literal('fusion_fallback_judge'),
    failedModel: z.string(),
    error: z.string(),
  }),
  z.object({
    type: z.literal('fusion_judge_parse_error'),
    raw: z.string(),
  }),
  // --- Dynamic concurrency telemetry ---
  z.object({
    type: z.literal('provider_rate_limited'),
    providerId: z.string(),
    retryAfterMs: z.number(),
    remainingRpm: z.number(),
  }),
]);

// Re-export from @chimera/context (source of truth — breaks circular dep).
// The Zod schema above is used for runtime validation; the TypeScript type
// comes from context so both packages share the same structural type.
export type ChimeraEvent = ChimeraEventBase;
