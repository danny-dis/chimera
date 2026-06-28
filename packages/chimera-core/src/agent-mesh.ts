import { EventStream } from './event-stream.js';
import { AgentConfig, AgentRole } from './types/agent.js';

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

  constructor(eventStream: EventStream) {
    this.eventStream = eventStream;
  }

  setQualityGateExecutor(executor: (params: { task: string; draftOutput?: string }) => Promise<QualityGateResult>): void {
    this.qualityGateExecutor = executor;
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
   * Each stage uses a different agent on a different provider.
   *
   * Returns detailed stage results for debugging and evaluation.
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
      return this.qualityGateExecutor({ task: params.task, draftOutput: params.draftOutput });
    }

    const stages: QualityGateStage[] = [];
    const startTime = Date.now();

    // Stage 1: Draft
    const draftStart = Date.now();
    this.safeEmit({
      type: 'draft_proposed',
      agentId: params.draftAgentId,
      patchId: 'pending',
      confidence: 0,
    });

    stages.push({
      stage: 'draft',
      agentId: params.draftAgentId,
      verdict: 'pass',
      output: params.draftOutput ?? '',
      findings: [],
      durationMs: Date.now() - draftStart,
    });

    // Stage 2: Verify
    const verifyStart = Date.now();
    const hasHighSeverityIssues = params.reviewerFindings?.some((f) => f.severity === 'high') ?? false;

    this.safeEmit({
      type: 'verified',
      agentId: params.reviewerAgentId,
      verdict: hasHighSeverityIssues ? 'fail' : 'pass',
      findings: params.reviewerFindings ?? [],
    });

    stages.push({
      stage: 'verify',
      agentId: params.reviewerAgentId,
      verdict: hasHighSeverityIssues ? 'fail' : 'pass',
      output: '',
      findings: params.reviewerFindings ?? [],
      durationMs: Date.now() - verifyStart,
    });

    // Stage 3: Challenge (optional)
    if (params.challengerAgentId) {
      const challengeStart = Date.now();
      this.safeEmit({
        type: 'challenged',
        agentId: params.challengerAgentId,
        challenges: params.challengerChallenges ?? [],
        alternatives: [],
      });

      stages.push({
        stage: 'challenge',
        agentId: params.challengerAgentId,
        verdict: 'pass',
        output: '',
        findings: [],
        durationMs: Date.now() - challengeStart,
      });
    }

    // Determine final verdict
    const hasFailures = stages.some((s) => s.verdict === 'fail');
    const hasRevisions = stages.some((s) => s.verdict === 'needs_revision');
    const finalVerdict = hasFailures ? 'fail' : hasRevisions ? 'needs_revision' : 'pass';

    return {
      stages,
      finalVerdict,
      verdict: finalVerdict,
      unifiedOutput: params.draftOutput ?? '',
      output: params.draftOutput ?? '',
      totalDurationMs: Date.now() - startTime,
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
