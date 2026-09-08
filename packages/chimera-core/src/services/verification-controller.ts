import type { Complexity, Evidence, EvidenceBundle, Checkpoint, AgentId, RunId } from '@chimera/domain';
import { AgentMesh } from '../agent-mesh.js';
import { EventStream } from '../event-stream.js';

export interface VerificationRequest {
  task: string;
  agentOutputs: Array<{
    agentId: AgentId;
    role: string;
    output: string;
    patch?: string;
    testResults?: Record<string, unknown>;
  }>;
  options?: {
    parallel?: boolean;
    reviewerModel?: string;
    challengerModel?: string;
  };
}

/**
 * VerificationController — evidence and verification pipeline.
 * Wraps AgentMesh's quality gate and adds evidence bundling.
 */
export class VerificationController {
  private agentMesh: AgentMesh;
  private eventStream: EventStream;

  constructor(eventStream?: EventStream) {
    this.eventStream = eventStream ?? new EventStream();
    this.agentMesh = new AgentMesh(this.eventStream);
  }

  /**
   * Determine if verification should run based on strategy and complexity.
   */
  shouldVerify(strategy: string, complexity: Complexity, task: string): boolean {
    // Always verify trio and above
    if (['trio', 'duo', 'swarm', 'hive'].includes(strategy)) return true;
    // Verify high-complexity tasks
    if (complexity.overall >= 0.6) return true;
    // Don't verify simple solo tasks
    return false;
  }

  /**
   * Run verification and produce evidence bundle.
   */
  async runVerification(
    runId: RunId,
    request: VerificationRequest,
  ): Promise<EvidenceBundle> {
    const evidences: Evidence[] = [];

    // Run quality gate via AgentMesh
    const qualityGateResult = await this.agentMesh.executeQualityGate({
      task: request.task,
      draftAgentId: request.agentOutputs.find((o) => o.role === 'implementer')?.agentId ?? '',
      reviewerAgentId: request.agentOutputs.find((o) => o.role === 'reviewer')?.agentId ?? '',
      draftOutput: request.agentOutputs.find((o) => o.role === 'implementer')?.output,
    });

    // Convert quality gate stages to evidence
    for (const stage of qualityGateResult.stages) {
      evidences.push({
        id: `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        runId,
        agentId: stage.agentId as AgentId,
        type: stage.stage === 'verify' ? 'review_finding' : 'provenance',
        verdict: stage.verdict,
        description: `${stage.stage} stage result`,
        severity: stage.verdict === 'pass' ? 'info' : stage.verdict === 'needs_revision' ? 'medium' : 'high',
        data: {
          output: stage.output,
          findings: stage.findings,
          durationMs: stage.durationMs,
        },
        timestamp: Date.now(),
      });
    }

    // Add provenance evidence for each agent output
    for (const output of request.agentOutputs) {
      if (output.role !== 'reviewer' && output.role !== 'challenger') {
        evidences.push({
          id: `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          runId,
          agentId: output.agentId,
          type: 'provenance',
          verdict: 'pass',
          description: `Output from ${output.role}`,
          severity: 'info',
          data: { output: output.output, patch: output.patch },
          timestamp: Date.now(),
        });
      }
    }

    const bundle: EvidenceBundle = {
      runId,
      evidences,
      summary: {
        total: evidences.length,
        passed: evidences.filter((e) => e.verdict === 'pass').length,
        failed: evidences.filter((e) => e.verdict === 'fail').length,
        needsRevision: evidences.filter((e) => e.verdict === 'needs_revision').length,
      },
      generatedAt: Date.now(),
    };

    this.eventStream.append({
      type: 'evidence_bundle_created',
      runId,
      bundle,
    } as any);

    return bundle;
  }

  /**
   * Finalize a run with verification.
   */
  async finalize(
    runId: RunId,
    bundle: EvidenceBundle,
    targetBefore: { mtime: number; size: number } | null,
  ): Promise<{
    status: 'done' | 'needs_user' | 'error';
    output: string;
    cost: number;
    agentCount: number;
  }> {
    const failedCount = bundle.summary.failed;
    const needsRevisionCount = bundle.summary.needsRevision;

    let status: 'done' | 'needs_user' | 'error' = 'done';
    let output = 'All verification passed.';

    if (failedCount > 0) {
      status = 'needs_user';
      output = `${failedCount} verification(s) failed. Please review.`;
    } else if (needsRevisionCount > 0) {
      status = 'needs_user';
      output = `${needsRevisionCount} verification(s) need revision.`;
    }

    return {
      status,
      output,
      cost: 0,
      agentCount: bundle.evidences.length,
    };
  }

  /**
   * Get the underlying AgentMesh.
   */
  getAgentMesh(): AgentMesh {
    return this.agentMesh;
  }
}
