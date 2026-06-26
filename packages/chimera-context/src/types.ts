/**
 * Shared types consumed by @chimera/context and re-exported by @chimera/core.
 *
 * Lives here to break the circular dependency:
 *   @chimera/core → @chimera/context → @chimera/core
 *
 * ChimeraEvent is a minimal discriminated union covering the subset of event
 * types that the context engine actually inspects. @chimera/core extends it
 * with the full 30+ member Zod schema at the type level.
 */

// ── Handoff types ───────────────────────────────────────────────────────────

export interface HandoffDocument {
  goal: string;
  status: 'in_progress' | 'blocked' | 'done';
  progress: string;
  decisions: Array<{ decision: string; rationale: string; source: string; confidence: string }>;
  next: Array<{ priority: 'HIGH' | 'MED' | 'LOW'; action: string }>;
  context: string[];
  filesModified: Array<{ path: string; status: string; lines: number }>;
  filesRead: Array<{ path: string; lines: string; reason: string }>;
  errors: string[];
  meta: {
    session: string;
    agent: string;
    provider: string;
    ts: string;
    contextFill: number;
    claims: string[];
  };
}

export interface HandoffDelta {
  base: string;
  progressDelta: string;
  decisionsAdded: Array<{ decision: string; rationale: string; source: string; confidence: string }>;
  nextUpdated: Array<{ priority: 'HIGH' | 'MED' | 'LOW'; action: string }>;
  filesModifiedAdded: Array<{ path: string; status: string; lines: number }>;
  claimsAdded: string[];
}

export interface HandoffChecklist {
  dataComplete: boolean;
  referencesGrounded: boolean;
  claimsVerified: boolean;
  capabilityMatch: boolean;
}

// ── Event types (context subset) ────────────────────────────────────────────
//
// Only the event members that handoff-protocol.ts and relay-racing.ts
// actually inspect via Extract<> or property access. The full Zod schema
// in @chimera/core extends this with ~20 more event types.

export type ChimeraEvent =
  | { type: 'user_request'; text: string; mode: string }
  | { type: 'task_classified'; complexity: { score: number; dimensions: Record<string, number> }; estimatedCost: number }
  | { type: 'task_decomposed'; subtasks: Array<{ id: string; description: string; dependencies: string[] }>; dependencyGraph: { nodes: string[]; edges: [string, string][] } }
  | { type: 'agent_spawned'; agentId: string; role: string; provider: string; model: string }
  | { type: 'context_pack_created'; files: string[]; tokenEstimate: number }
  | { type: 'draft_proposed'; agentId: string; patchId: string; confidence: number }
  | { type: 'verified'; agentId: string; verdict: 'pass' | 'fail' | 'needs_revision'; findings: Array<{ description: string; severity: 'high' | 'med' | 'low'; evidence: string }> }
  | { type: 'challenged'; agentId: string; challenges: string[]; alternatives: string[] }
  | { type: 'disagreement_detected'; agents: string[]; issue: string; resolution: 'voting' | 'challenger' | 'user' }
  | { type: 'handoff_triggered'; fromAgent: string; toAgent: string; reason: 'context_threshold' | 'task_boundary'; format: 'compact' | 'delta'; tokenCount: number; claimIds: string[] }
  | { type: 'handoff_validated'; accepted: boolean; checklist: HandoffChecklist; clarifications: string[] }
  | { type: 'tool_call_requested'; call: { tool: string; args: Record<string, unknown> }; policy: 'allow' | 'ask' | 'deny' | 'escalate' }
  | { type: 'tool_call_result'; result: { tool: string; output: string; exitCode?: number } }
  | { type: 'patch_proposed'; patchId: string; files: string[] }
  | { type: 'check_result'; command: string; exitCode: number; outputRef: string }
  | { type: 'review_finding'; severity: 'blocker' | 'warning' | 'note'; evidence: Array<{ file: string; line?: number; description: string }> }
  | { type: 'cost_alert'; currentCost: number; budget: number; percentage: number; action: 'warn' | 'throttle' | 'stop' }
  | { type: 'context_threshold_reached'; agentId: string; fillPercent: number; tier: number }
  | { type: 'session_compacted'; summaryRef: string }
  | { type: 'final_response'; status: 'done' | 'blocked' | 'needs_user'; cost: number; agentCount: number; output?: string }
  | { type: 'deliberation_result'; mode: 'solo' | 'duo' | 'trio' | 'fusion' | 'hive' | 'merge' | 'auto'; output: string; analysis: { thought: string; consensus: string[]; conflicts: string[]; uniqueInsights: string[]; blindSpots: string[]; confidence: number } }
  | { type: 'provenance_claim'; claimId: string; source: string; agentId: string; confidence: number }
  | { type: 'quality_gate_parallel_started'; reviewerId: string; challengerId: string; draftPreview: string }
  | { type: 'quality_gate_parallel_completed'; reviewerId: string; challengerId: string; reviewerStatus: 'fulfilled' | 'rejected'; challengerStatus: 'fulfilled' | 'rejected'; durationMs: number }
  | { type: 'workflow_registered'; name: string; path?: string; stepCount: number }
  | { type: 'workflow_started'; task: string }
  | { type: 'workflow_completed'; task: string; output: unknown }
  | { type: 'workflow_run_started'; name: string; runId: string }
  | { type: 'workflow_run_completed'; name: string; runId: string; status: 'success' | 'error' | 'cancelled'; durationMs: number; stepCount: number }
  | { type: 'workflow_step_completed'; name: string; runId: string; stepId: string; kind: 'llm' | 'tool' | 'parallel' | 'sequence' | 'gate' | 'loop'; durationMs: number }
  | { type: 'loop_iteration_started'; runId: string; stepId: string; iteration: number; maxIterations: number }
  | { type: 'loop_iteration_completed'; runId: string; stepId: string; iteration: number; durationMs: number; completionDetected: boolean }
  | { type: 'loop_iteration_failed'; runId: string; stepId: string; iteration: number; error: string }
  | { type: 'workflow_dispatched'; workflowRunId: string; workflowName: string }
  | { type: 'workflow_dispatch_failed'; workflowRunId: string; workflowName: string; error: string }
  | { type: 'skill_loaded'; skillName: string; source: 'workspace' | 'global' | 'pack' | 'bundled'; bytes: number }
  | { type: 'learning_completed'; skillsCreated: number; skillsUpdated: number; workflowsCreated: number; workflowsUpdated: number; packsCreated: number; durationMs: number }
  | { type: 'skill_synthesized'; name: string; confidence: number; action: 'created' | 'updated' }
  | { type: 'workflow_synthesized'; name: string; confidence: number; action: 'created' | 'updated' }
  | { type: 'auto_preset_selected'; task: string; complexity: number; selectedPreset: 'solo' | 'duo' | 'trio' | 'fusion' | 'merge' | 'hive' | 'auto'; taskType: string; timestamp: number }
  | { type: 'mode_preset_warning'; mode: string; preset: string; resolvedPreset: string; reason: string }
  | { type: 'mode_preset_resolved'; mode: string; preset: string; complexity?: number; task?: string; timestamp?: number }
  | { type: 'error'; message: string };
