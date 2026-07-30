import { EventStream } from './event-stream.js';
import { AgentConfig, AgentRole } from './types/agent.js';
import { TrioExecutor } from './coordinator/trio-executor.js';
import type { TrioConfig, TrioProviderFactory, TrioStageResult } from './coordinator/trio-types.js';
import type { ModelRegistry } from '@chimera/providers';
import type { CostTracker } from './cost-tracker.js';

/**
 * Inter-agent message for communication between agents.
 */
export interface AgentMessage {
  from: string;
  to: string;
  type: 'review_request' | 'review_result' | 'challenge' | 'synthesis_input' | 'handoff';
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Quality gate stage result.
 */
export interface QualityGateStage {
  stage: 'draft' | 'verify' | 'challenge' | 'synthesize';
  agentId: string;
  verdict: 'pass' | 'fail' | 'needs_revision';
  output: string;
  findings: Array<{ description: string; severity: 'high' | 'med' | 'low'; evidence: string }>;
  durationMs: number;
}

/**
 * Quality gate result.
 */
export interface QualityGateResult {
  stages: QualityGateStage[];
  finalVerdict: 'pass' | 'fail' | 'needs_revision';
  verdict: 'pass' | 'fail' | 'needs_revision';
  unifiedOutput: string;
  output: string;
  totalDurationMs: number;
  /**
   * True only when this result reflects genuine model-based deliberation —
   * either an injected `qualityGateExecutor` or internal `TrioExecutor`
   * delegation (see `setDeliberationDeps`). False means NO independent
   * verification happened: the gate only reformatted whatever the caller
   * already passed in (`draftOutput` / `reviewerFindings` /
   * `challengerChallenges`), and `verdict`/`finalVerdict` must be read as
   * "unverified" rather than a real pass/fail judgment.
   */
  verified: boolean;
}

/** Optional dependencies that let the default quality gate delegate to a
 *  real `TrioExecutor` deliberation instead of the unverified passthrough. */
export interface AgentMeshDeliberationDeps {
  registry: ModelRegistry;
  providerFactory: TrioProviderFactory;
  costTracker?: CostTracker;
}

/**
 * Coordinates parallel subagent lifecycle, serial quality gate,
 * and inter-agent message routing.
 *
 * Enhanced with patterns from Omnigent:
 * - Cross-vendor review enforcement
 * - Purpose-guarded dispatch
 * - Real quality gate execution
 */
export class AgentMesh {
  private agents: Map<string, AgentConfig> = new Map();
  private messages: AgentMessage[] = [];
  private eventStream: EventStream;
  private qualityGateExecutor?: (params: { task: string; draftOutput?: string }) => Promise<QualityGateResult>;
  private trioDeps?: AgentMeshDeliberationDeps;

  constructor(eventStream: EventStream) {
    this.eventStream = eventStream;
  }

  setQualityGateExecutor(executor: (params: { task: string; draftOutput?: string }) => Promise<QualityGateResult>): void {
    this.qualityGateExecutor = executor;
  }

  /**
   * Wire real model providers + a `ModelRegistry` so the default
   * `executeQualityGate` path can delegate to a genuine 4-stage
   * `TrioExecutor` deliberation (draft → review → challenge → synthesize)
   * instead of the honest-but-unverified passthrough.
   *
   * Optional. When neither this nor `setQualityGateExecutor` is called,
   * `executeQualityGate` degrades to the unverified path — it will never
   * fabricate a `pass` verdict for work that never happened.
   */
  setDeliberationDeps(deps: AgentMeshDeliberationDeps): void {
    this.trioDeps = deps;
  }

  private safeEmit(event: unknown): void {
    try { this.eventStream.append(event as Parameters<EventStream['append']>[0]); } catch { /* ignore */ }
  }

  registerAgent(config: AgentConfig): void {
    this.agents.set(config.id, config);
    this.safeEmit({
      type: 'agent_spawned',
      agentId: config.id,
      role: config.role,
      provider: config.provider,
      model: config.model,
    });
  }

  getAgent(id: string): AgentConfig | undefined {
    return this.agents.get(id);
  }

  getAgentsByRole(role: AgentRole): AgentConfig[] {
    return Array.from(this.agents.values()).filter((a) => a.role === role);
  }

  /**
   * Send a message between agents.
   */
  sendMessage(message: AgentMessage): void {
    this.messages.push(message);
    this.safeEmit({
      type: 'provenance_claim',
      claimId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: `${message.from} → ${message.to}`,
      agentId: message.from,
      confidence: 1,
    });
  }

  /**
   * Get messages for a specific agent.
   */
  getMessagesForAgent(agentId: string): AgentMessage[] {
    return this.messages.filter((m) => m.to === agentId);
  }

  /**
   * Get all messages in the mesh.
   */
  getAllMessages(): AgentMessage[] {
    return [...this.messages];
  }

  /**
   * Clear messages (e.g., after a handoff).
   */
  clearMessages(): void {
    this.messages = [];
  }

  /**
   * Serial quality gate: draft → verify → challenge → synthesize.
   *
   * Dispatch order:
   *   1. `qualityGateExecutor` (if injected via `setQualityGateExecutor`) —
   *      trusted as a real, caller-owned deliberation implementation.
   *   2. `TrioExecutor` delegation (if wired via `setDeliberationDeps` AND
   *      the draft/reviewer agent ids resolve to registered agents with a
   *      model) — genuinely calls models through the same 4-stage gate
   *      used elsewhere in the codebase.
   *   3. Unverified passthrough — NO model is called. The result honestly
   *      reports `verified: false` and a `verdict` that is never `pass`,
   *      because nothing was actually checked.
   */
  async executeQualityGate(params: {
    draftAgentId: string;
    reviewerAgentId: string;
    challengerAgentId?: string;
    task: string;
    draftOutput?: string;
    reviewerFindings?: Array<{ description: string; severity: 'high' | 'med' | 'low'; evidence: string }>;
    challengerChallenges?: string[];
  }): Promise<QualityGateResult> {
    if (this.qualityGateExecutor) {
      const result = await this.qualityGateExecutor({ task: params.task, draftOutput: params.draftOutput });
      // The injected executor is trusted to have done real work; default
      // `verified: true` unless it explicitly said otherwise.
      return { verified: true, ...result };
    }

    if (this.trioDeps) {
      const viaTrio = await this.executeQualityGateViaTrio(params);
      if (viaTrio) return viaTrio;
      // Agent ids didn't resolve to registered models — fall through to
      // the honest unverified path rather than guessing a model id.
    }

    return this.executeQualityGateUnverified(params);
  }

  /**
   * Real delegation path: resolves the draft/reviewer/(optional challenger)
   * agent ids to their registered models and runs an actual `TrioExecutor`
   * deliberation. Returns `null` when the required agents aren't
   * registered (nothing to delegate to), letting the caller fall back to
   * the unverified path instead of guessing model ids.
   */
  private async executeQualityGateViaTrio(params: {
    draftAgentId: string;
    reviewerAgentId: string;
    challengerAgentId?: string;
    task: string;
  }): Promise<QualityGateResult | null> {
    const deps = this.trioDeps;
    if (!deps) return null;

    const draftAgent = this.agents.get(params.draftAgentId);
    const reviewerAgent = this.agents.get(params.reviewerAgentId);
    const challengerAgent = params.challengerAgentId ? this.agents.get(params.challengerAgentId) : undefined;

    if (!draftAgent || !reviewerAgent) return null;

    const trioExecutor = new TrioExecutor({
      eventStream: this.eventStream,
      registry: deps.registry,
      costTracker: deps.costTracker,
    });

    const config: TrioConfig = {
      writer: draftAgent.model,
      reviewer: reviewerAgent.model,
      ...(challengerAgent ? { challenger: challengerAgent.model } : {}),
    };

    const startTime = Date.now();
    const result = await trioExecutor.executeWithAnalysis(params.task, config, deps.providerFactory);

    const roleToStage: Record<TrioStageResult['role'], QualityGateStage['stage']> = {
      writer: 'draft',
      reviewer: 'verify',
      challenger: 'challenge',
      synthesizer: 'synthesize',
    };
    const roleToAgentId: Record<TrioStageResult['role'], string> = {
      writer: params.draftAgentId,
      reviewer: params.reviewerAgentId,
      challenger: params.challengerAgentId ?? '',
      synthesizer: 'synthesizer',
    };
    const normalizeSeverity = (s: string): 'high' | 'med' | 'low' =>
      s === 'high' || s === 'med' || s === 'low' ? s : 'med';
    const stageVerdict = (s: TrioStageResult): 'pass' | 'fail' | 'needs_revision' => {
      if (s.role !== 'reviewer') return 'pass';
      const hasHigh = s.issues?.some((i) => i.severity === 'high') ?? false;
      if (hasHigh) return 'fail';
      return (s.issues?.length ?? 0) > 0 ? 'needs_revision' : 'pass';
    };

    const stages: QualityGateStage[] = result.stages.map((s) => ({
      stage: roleToStage[s.role],
      agentId: roleToAgentId[s.role],
      verdict: stageVerdict(s),
      output: s.content,
      findings: (s.issues ?? []).map((i) => ({
        description: i.description,
        severity: normalizeSeverity(i.severity),
        evidence: i.evidence,
      })),
      durationMs: s.durationMs,
    }));

    // TrioExecutor emits its own verified/challenged/final_response events
    // against the shared eventStream; backfill draft_proposed so the mesh's
    // existing event contract is preserved.
    this.safeEmit({
      type: 'draft_proposed',
      agentId: params.draftAgentId,
      patchId: 'pending',
      confidence: result.degraded ? 0 : 1,
    });

    let finalVerdict: 'pass' | 'fail' | 'needs_revision';
    if (result.degraded) {
      finalVerdict = 'fail';
    } else if (result.needsUserEscalation) {
      finalVerdict = 'needs_revision';
    } else {
      const hasFailures = stages.some((s) => s.verdict === 'fail');
      const hasRevisions = stages.some((s) => s.verdict === 'needs_revision');
      finalVerdict = hasFailures ? 'fail' : hasRevisions ? 'needs_revision' : 'pass';
    }

    return {
      stages,
      finalVerdict,
      verdict: finalVerdict,
      unifiedOutput: result.output,
      output: result.output,
      totalDurationMs: Date.now() - startTime,
      verified: true,
    };
  }

  /**
   * Honest fallback when no real deliberation is available: NO model is
   * called. Every stage only reformats whatever the caller already passed
   * in, so the verdict can never be reported as `pass` — that would be
   * claiming a check happened when it didn't. Each stage carries a
   * `findings` entry explaining why.
   */
  private executeQualityGateUnverified(params: {
    draftAgentId: string;
    reviewerAgentId: string;
    challengerAgentId?: string;
    task: string;
    draftOutput?: string;
    reviewerFindings?: Array<{ description: string; severity: 'high' | 'med' | 'low'; evidence: string }>;
    challengerChallenges?: string[];
  }): QualityGateResult {
    const NOT_VERIFIED = 'No quality gate executor or TrioExecutor dependencies are configured on this AgentMesh — this stage was NOT independently verified by a model.';
    const stages: QualityGateStage[] = [];
    const startTime = Date.now();

    // Stage 1: Draft — not independently verified.
    this.safeEmit({ type: 'draft_proposed', agentId: params.draftAgentId, patchId: 'pending', confidence: 0 });
    stages.push({
      stage: 'draft',
      agentId: params.draftAgentId,
      verdict: 'needs_revision',
      output: params.draftOutput ?? '',
      findings: [{ description: NOT_VERIFIED, severity: 'high', evidence: 'AgentMesh.executeQualityGate: no executor/providers configured' }],
      durationMs: 0,
    });

    // Stage 2: Verify — reformats caller-supplied findings, if any. No
    // model is called here; a hard-fail signal in the supplied findings is
    // still honored (it's real data the caller already has), but the
    // absence of findings is never read as "verified clean".
    const hasHighSeverityIssues = params.reviewerFindings?.some((f) => f.severity === 'high') ?? false;
    const verifyVerdict: 'fail' | 'needs_revision' = hasHighSeverityIssues ? 'fail' : 'needs_revision';
    this.safeEmit({
      type: 'verified',
      agentId: params.reviewerAgentId,
      verdict: verifyVerdict,
      findings: params.reviewerFindings ?? [],
    });
    stages.push({
      stage: 'verify',
      agentId: params.reviewerAgentId,
      verdict: verifyVerdict,
      output: '',
      findings: params.reviewerFindings ?? [],
      durationMs: 0,
    });

    // Stage 3: Challenge (optional) — same caveat.
    if (params.challengerAgentId) {
      this.safeEmit({
        type: 'challenged',
        agentId: params.challengerAgentId,
        challenges: params.challengerChallenges ?? [],
        alternatives: [],
      });
      stages.push({
        stage: 'challenge',
        agentId: params.challengerAgentId,
        verdict: 'needs_revision',
        output: '',
        findings: [],
        durationMs: 0,
      });
    }

    const hasFailures = stages.some((s) => s.verdict === 'fail');
    const finalVerdict: 'fail' | 'needs_revision' = hasFailures ? 'fail' : 'needs_revision';

    return {
      stages,
      finalVerdict,
      verdict: finalVerdict,
      unifiedOutput: params.draftOutput ?? '',
      output: params.draftOutput ?? '',
      totalDurationMs: Date.now() - startTime,
      verified: false,
    };
  }

  /**
   * Get agents that are available for assignment.
   */
  getAvailableAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get the best agent for a specific role.
   * Prefers agents from different vendors than already used.
   */
  getBestAgentForRole(role: AgentRole, usedVendors: Set<string>): AgentConfig | null {
    const candidates = this.getAgentsByRole(role);

    if (candidates.length === 0) return null;

    // Prefer agents from unused vendors
    const freshVendor = candidates.find((c) => !usedVendors.has(c.provider));
    if (freshVendor) return freshVendor;

    // Fall back to any available agent
    return candidates[0];
  }
}
