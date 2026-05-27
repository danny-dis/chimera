import { z } from 'zod';

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
    policy: z.enum(['allow', 'ask', 'deny']),
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
    type: z.literal('final_response'),
    status: z.enum(['done', 'blocked', 'needs_user']),
    cost: z.number(),
    agentCount: z.number(),
  }),
  z.object({
    type: z.literal('provenance_claim'),
    claimId: z.string(),
    source: z.string(),
    agentId: z.string(),
    confidence: z.number(),
  }),
]);

export type ChimeraEvent = z.infer<typeof ChimeraEventSchema>;
